//! Live diagnostic dashboard — a zero-new-dependency `std::net` HTTP server
//! that the backend binds on localhost at startup and auto-opens in the OS
//! browser. It renders every active structure in the process in real time:
//!
//!   * backend-observed: generation tasks, live groups, the per-stage memory
//!     ring (first → peak RSS + peak stage), a live RSS probe;
//!   * renderer-reported: the module-level structure sizes that outlive the
//!     `{#key}` remount (composerStore.sessions, unsynced, director runStates,
//!     the flows-loaded latch, lastPreview, project files), the JS heap, the
//!     frame-pipeline ledger, and the main-thread stall meter;
//!   * a bounded ring of recent `[UI]` / DIRECTOR / js-error log lines so a
//!     hung webview is diagnosable from a SEPARATE process that a frozen
//!     renderer cannot also freeze.
//!
//! This is the "show me all active structures" answer to "which one is
//! ratcheting": a dashboard that keeps working even when the main window is
//! wedged, because it is its own process.
//!
//! No new crates: `std::net` + `serde_json` (already a dependency). Bind
//! failures are logged and swallowed — the dashboard must never take the app
//! down.

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::generation::group::GroupCoordinator;
use crate::generation::GenerationService;

/// Localhost port the dashboard tries, in order, until one binds.
const PORT_BASE: u16 = 41777;
const PORT_SPAN: u16 = 8;
/// How many recent diagnostic log lines the ring keeps.
const LOG_RING_CAP: usize = 400;

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Renderer-reported structure sizes (src/lib/dashReport.ts). The renderer
/// can't hand a reference to its module Maps across the process boundary, so
/// it pushes a compact size snapshot on each RamMonitor tick; the dashboard
/// merges it with what the backend can read directly.
// NOTE: keys are snake_case to match the renderer's DashSnapshot
// (src/lib/dashStore.ts) EXACTLY — Tauri passes the `input` object's inner
// keys through unconverted, so a camelCase rename here would silently
// deserialize every field to its default (the "renderer not reporting" bug).
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct RendererMetrics {
    pub timestamp_ms: u64,
    pub sessions_size: u32,
    pub unsynced_size: u32,
    pub run_states_size: u32,
    pub flows_loaded_size: u32,
    pub last_preview_size: u32,
    pub projects_files_size: u32,
    pub heap_used_bytes: Option<u64>,
    /// The frame-pipeline ledger (src/lib/pipelineDiag getPipelineSnapshot).
    pub pipeline: Option<serde_json::Value>,
    /// The main-thread stall meter (src/lib/stallWatch getStallSnapshot).
    pub stall: Option<serde_json::Value>,
}

/// The one shared dashboard state, cloned into the HTTP thread. Backend-
/// observed structures are read LIVE at request time (that is the point —
/// real time); only the renderer-reported snapshot + log ring are stored,
/// because the renderer is the only source that can see them.
pub struct DashboardShared {
    port: std::sync::atomic::AtomicU16,
    started_unix_ms: u64,
    renderer: Mutex<Option<RendererMetrics>>,
    log_ring: Mutex<VecDeque<(u64, String)>>,
}

impl DashboardShared {
    pub fn new() -> Self {
        Self {
            port: std::sync::atomic::AtomicU16::new(0),
            started_unix_ms: now_unix_ms(),
            renderer: Mutex::new(None),
            log_ring: Mutex::new(VecDeque::new()),
        }
    }

    /// Interior-mutable so the server thread can publish the bound port
    /// through the shared `Arc` (no `&mut` needed across the Arc).
    pub fn set_port(&self, port: u16) {
        self.port.store(port, std::sync::atomic::Ordering::Release);
    }

    /// Record one diagnostic line (timestamped) for the dashboard feed.
    pub fn record_log_line(&self, line: &str) {
        let mut ring = self.log_ring.lock().unwrap();
        ring.push_back((now_unix_ms(), line.to_string()));
        while ring.len() > LOG_RING_CAP {
            ring.pop_front();
        }
    }

    pub fn set_renderer_metrics(&self, m: RendererMetrics) {
        *self.renderer.lock().unwrap() = Some(m);
    }

    /// The full live snapshot the `/api/snapshot` endpoint serves. Backend
    /// structures are read directly from the registry + group coordinator so
    /// they are always current; renderer + log ring come from the store.
    pub fn build_snapshot(
        &self,
        gen: &GenerationService,
        group: &GroupCoordinator,
    ) -> serde_json::Value {
        let profiler = gen.registry.memory_profiler();
        let ring = profiler.snapshot();
        let (live_rss, total, free) = crate::generation::memory_profile::MemoryProfiler::probe();
        let tasks = gen.registry.managed_tasks();
        let active = gen.registry.active_task_count();
        let groups = group.live_groups();
        let renderer = self.renderer.lock().unwrap().clone();
        let log_lines: Vec<serde_json::Value> = self
            .log_ring
            .lock()
            .unwrap()
            .iter()
            .map(|(ts, line)| json!({ "ts": ts, "line": line }))
            .collect();

        json!({
            "server": {
                "port": self.port.load(std::sync::atomic::Ordering::Acquire),
                "uptime_ms": now_unix_ms().saturating_sub(self.started_unix_ms),
                "started_unix_ms": self.started_unix_ms,
            },
            "backend": {
                "pid": std::process::id(),
                "rss_bytes": live_rss,
                "total_memory_bytes": total,
                "free_memory_bytes": free,
                "active_tasks": active,
                "managed_tasks": tasks.len(),
                "tasks": tasks,
                "groups": groups,
                "memory_ring_len": ring.len(),
                "memory_ring_summary": profiler.summary_line(),
                "memory_ring": ring,
            },
            "renderer": renderer,
            "log": log_lines,
        })
    }
}

/// Serve the dashboard over a dedicated std thread on `127.0.0.1`. Binds the
/// first free port in the range; on total failure logs and returns
/// (the dashboard is diagnostic, never fatal). When `auto_open` is true it
/// launches the OS default browser to the URL after a short delay.
pub fn start(gen: Arc<GenerationService>, group: Arc<GroupCoordinator>, shared: Arc<DashboardShared>, auto_open: bool) {
    let listener = (0..PORT_SPAN)
        .map(|i| {
            let addr = std::net::SocketAddr::from((std::net::Ipv4Addr::LOCALHOST, PORT_BASE + i));
            TcpListener::bind(addr)
        })
        .find_map(|r| r.ok());
    let Some(listener) = listener else {
        log::warn!("[Dashboard] could not bind any port {}..={} — dashboard disabled", PORT_BASE, PORT_BASE + PORT_SPAN - 1);
        return;
    };
    let port = listener.local_addr().ok().map(|a| a.port()).unwrap_or(0);
    shared.set_port(port);
    listener
        .set_nonblocking(true)
        .ok();

    let gen2 = gen.clone();
    let group2 = group.clone();
    let shared2 = shared.clone();
    std::thread::Builder::new()
        .name("vm-dashboard".into())
        .spawn(move || {
            serve_blocking(listener, gen2, group2, shared2);
        })
        .ok();

    log::info!("[Dashboard] live at http://127.0.0.1:{} (auto-open {})", port, auto_open);
    if auto_open {
        let url = format!("http://127.0.0.1:{}", port);
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1200));
            open_browser(&url);
        });
    }
}

fn serve_blocking(listener: TcpListener, gen: Arc<GenerationService>, group: Arc<GroupCoordinator>, shared: Arc<DashboardShared>) {
    for stream in listener.incoming() {
        match stream {
            Ok(s) => {
                let g = gen.clone();
                let gr = group.clone();
                let sh = shared.clone();
                // One thread per connection; the dashboard is low-traffic.
                std::thread::spawn(move || handle_conn(s, g, gr, sh));
            }
            Err(e) => {
                log::debug!("[Dashboard] accept error: {}", e);
            }
        }
    }
}

fn handle_conn(mut stream: TcpStream, gen: Arc<GenerationService>, group: Arc<GroupCoordinator>, shared: Arc<DashboardShared>) {
    // Read the request head (we only need the request line for the path).
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
    let mut buf = [0u8; 4096];
    let n = match stream.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return,
    };
    let req = String::from_utf8_lossy(&buf[..n]);
    let first_line = req.lines().next().unwrap_or("");
    // First token that starts with '/' is the request path.
    let path = first_line
        .split_whitespace()
        .find(|t| t.starts_with('/'))
        .unwrap_or("/");

    if path.starts_with("/api/snapshot") {
        let snap = shared.build_snapshot(&gen, &group);
        let body = snap.to_string();
        let resp = format!(
            "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: application/json\r\nContent-Length: {}\r\nCache-Control: no-store\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(resp.as_bytes());
        let _ = stream.flush();
    } else if path == "/api/health" {
        let body = "ok";
        let _ = stream
            .write_all(
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n{}",
                    body.len(),
                    body
                )
                .as_bytes(),
            );
        let _ = stream.flush();
    } else {
        let html = DASHBOARD_HTML;
        let _ = stream
            .write_all(
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\n\r\n{}",
                    html.len(),
                    html
                )
                .as_bytes(),
            );
        let _ = stream.flush();
    }
}

fn open_browser(url: &str) {
    use std::process::Command;
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("cmd").args(["/C", "start", "", url]).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("xdg-open").arg(url).spawn();
    }
}

/// `GET /` — the self-contained live dashboard. No build step, no external
/// assets: one canvas sparkline for the backend memory ring + a live-polling
/// table of every structure the dashboard can see. Polls /api/snapshot.
const DASHBOARD_HTML: &str = r##"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>VisionMachine Live Dashboard</title>
<style>
:root{--bg:#0d1017;--panel:#151a24;--panel2:#1b2130;--ink:#e8edf5;--mut:#8b97a8;--line:#28303f;--ok:#3fd08a;--warn:#f5b544;--err:#ff6b6b;--acc:#5aa2ff;}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif;padding:16px}
h1{font-size:17px;margin:0 0 4px}.sub{color:var(--mut);font-size:12px;margin-bottom:16px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.card h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin:0 0 10px}
.kv{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed var(--line);font-size:13px}
.kv:last-child{border-bottom:none}.kv .k{color:var(--mut)}.kv .v{font-variant-numeric:tabular-nums;font-weight:600}
.big{font-size:24px;font-weight:700}canvas{width:100%;height:90px;display:block;margin-top:6px;background:var(--panel2);border-radius:6px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:600;position:sticky;top:0;background:var(--panel)}td{font-variant-numeric:tabular-nums}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
.dok{background:var(--ok)}.dwarn{background:var(--warn)}.derr{background:var(--err)}.dmute{background:var(--mut)}
.tag{font-size:10px;padding:1px 6px;border-radius:9px;background:var(--panel2);border:1px solid var(--line);color:var(--mut)}
pre{background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:8px;height:160px;overflow:auto;font-size:11px;color:#cdd7e4;margin:0;white-space:pre-wrap}
.chip{display:inline-flex;align-items:center;padding:2px 8px;border-radius:10px;background:var(--panel2);border:1px solid var(--line);margin:2px 4px 2px 0;font-size:12px}
.chip b{margin-left:6px;font-variant-numeric:tabular-nums}
.wide{grid-column:1/-1}.live{color:var(--ok)}#logwrap{height:210px}.scroll{max-height:220px;overflow:auto}
</style>
</head>
<body>
<h1>VisionMachine — Live Structures Dashboard</h1>
<div class="sub">Backend pid <span id="pid">–</span> · port <span id="port">–</span> · uptime <span id="up">–</span> · <span class="live">● polling</span> every 1.5 s · <span id="last">never</span></div>
<div class="grid">
  <div class="card"><h2>Backend process</h2>
    <div class="kv"><span class="k">RSS (live)</span><span class="v big" id="rss">–</span></div>
    <div class="kv"><span class="k">System total / free</span><span class="v" id="memsys">–</span></div>
    <div class="kv"><span class="k">Active tasks</span><span class="v" id="act">–</span></div>
    <div class="kv"><span class="k">Memory ring (stage-attributed)</span><span class="v" id="ringsum">–</span></div>
    <canvas id="memline" height="90"></canvas>
  </div>
  <div class="card"><h2>Renderer structures (module-level, outlive remount)</h2>
    <div id="rstruct">no renderer report yet</div>
  </div>
  <div class="card"><h2>Frame pipeline ledger</h2>
    <div id="pipe">–</div>
  </div>
  <div class="card"><h2>Main-thread stall meter</h2>
    <div id="stall">–</div>
  </div>
  <div class="card wide"><h2>Generation tasks (<span id="taskcount">0</span> managed)</h2>
    <div class="scroll"><table id="tasks"><thead><tr><th>task</th><th>session</th><th>pipe</th><th>status</th><th>stage</th><th>prog</th><th>error</th></tr></thead><tbody></tbody></table></div>
  </div>
  <div class="card wide"><h2>Live generation groups (<span id="groupcount">0</span>)</h2>
    <div class="scroll"><table id="groups"><thead><tr><th>group</th><th>session</th><th>status</th><th>queue</th><th>compose</th><th>pipes</th></tr></thead><tbody></tbody></table></div>
  </div>
  <div class="card wide"><h2>Recent backend log ring (last 400 lines)</h2><div id="logwrap"><pre id="log"></pre></div></div>
</div>
<script>
function mb(b){return b==null?'–':(b/1048576).toFixed(1)+' MB'}
function chip(k,v){return '<span class="chip">'+k+'<b>'+v+'</b></span>'}
function dot(cls){return '<span class="dot '+cls+'"></span>'}
function statusCls(s){s=(s||'').toLowerCase();return (s==='running'||s==='queued')?'dok':(s==='done'?'dok':(s==='error'?'derr':(s==='cancelled'?'dwarn':'dmute')))}
async function tick(){
  try{
    const r=await fetch('/api/snapshot',{cache:'no-store'});const d=await r.json();
    document.getElementById('pid').textContent=d.backend.pid;
    document.getElementById('port').textContent=d.server.port;
    document.getElementById('up').textContent=Math.round(d.server.uptime_ms/1000)+'s';
    document.getElementById('last').textContent=new Date().toLocaleTimeString();
    document.getElementById('rss').textContent=mb(d.backend.rss_bytes);
    document.getElementById('memsys').textContent=mb(d.backend.total_memory_bytes)+' / '+mb(d.backend.free_memory_bytes);
    document.getElementById('act').textContent=d.backend.active_tasks+' / '+d.backend.managed_tasks+' managed';
    document.getElementById('ringsum').textContent=d.backend.memory_ring_summary;
    drawMem(d.backend.memory_ring||[]);
    // renderer structures
    const rn=d.renderer||{};
    const rs=document.getElementById('rstruct');
    if(rn.timestamp_ms){
      rs.innerHTML=
        chip('composerStore.sessions',rn.sessions_size)+
        chip('unsynced',rn.unsynced_size)+
        chip('director runStates',rn.run_states_size)+
        chip('flows-loaded latch',rn.flows_loaded_size)+
        chip('lastPreview',rn.last_preview_size)+
        chip('projectFiles',rn.projects_files_size)+
        chip('JS heap',mb(rn.heap_used_bytes));
    }else rs.innerHTML='<span class="tag">renderer not reporting (is the window wedged?)</span>';
    // pipeline
    const p=rn.pipeline||null;const pe=document.getElementById('pipe');
    if(p){pe.innerHTML=
      chip('src',p.sourcesActive+' / '+p.sourcesCreated)+
      chip('cache sets',p.cacheSets)+chip('LRU evict',p.lruEvictions)+
      chip('clones out',p.clonesOutstanding)+chip('inflight peak',p.inflightPeak)+
      chip('outQ peak',p.outputQueuePeak)+chip('frames/min',p.frameCallsPerMin)}
    else pe.textContent='–';
    // stall
    const st=rn.stall||null;const se=document.getElementById('stall');
    if(st){se.innerHTML=
      chip('longtask count',st.longtask_count??st.longtaskCount??'–')+
      chip('max', (st.longtask_max_ms??st.longtaskMaxMs??0)+'ms')+
      chip('total', (st.longtask_total_ms??st.longtaskTotalMs??0)+'ms')+
      (st.supported?'':' <span class="tag">longtask unsupported</span>')}
    else se.textContent='–';
    // tasks
    const tb=document.querySelector('#tasks tbody');tb.innerHTML='';
    document.getElementById('taskcount').textContent=d.backend.tasks.length;
    for(const t of (d.backend.tasks||[])){
      const cur=(t.stages||[]).find(s=>!['done','error','cancelled'].includes((s.status||'').toLowerCase()));
      const tr=document.createElement('tr');
      tr.innerHTML='<td>'+(t.task_id||'').slice(0,8)+'</td><td>'+(t.session_id||'').slice(0,8)+'</td><td>'+(t.pipe_id||'').slice(0,8)+'</td>'+
        '<td>'+dot(statusCls(t.status))+t.status+'</td><td>'+(cur?cur.label+':'+cur.status:'–')+'</td><td>'+Math.round((t.progress||0)*100)+'%</td><td style="color:var(--err)">'+(t.error||'')+'</td>';
      tb.appendChild(tr);
    }
    // groups
    const gb=document.querySelector('#groups tbody');gb.innerHTML='';
    document.getElementById('groupcount').textContent=d.backend.groups.length;
    for(const g of (d.backend.groups||[])){
      const pipes=g.pipes.map(p=>(p.status||'')+Math.round((p.progress||0)*100)+'%').join(' · ');
      const tr=document.createElement('tr');
      tr.innerHTML='<td>'+(g.group_id||'').slice(0,8)+'</td><td>'+(g.session_id||'').slice(0,8)+'</td><td>'+dot('dok')+g.status+'</td><td>'+g.queue_len+'</td><td>'+(g.compose_state||'–')+'</td><td style="max-width:400px">'+pipes+'</td>';
      gb.appendChild(tr);
    }
    // log
    const lg=document.getElementById('log');const lines=(d.log||[]).map(l=>new Date(l.ts).toLocaleTimeString()+'  '+l.line);
    lg.textContent=lines.length?lines.join('\n'):'(no [UI] log lines yet)';lg.scrollTop=lg.scrollHeight;
  }catch(e){document.getElementById('last').textContent='error: '+e.message}
}
function drawMem(ring){
  const c=document.getElementById('memline');const dpr=window.devicePixelRatio||1;
  c.width=c.clientWidth*dpr;c.height=90*dpr;const x=c.getContext('2d');x.scale(dpr,dpr);
  const W=c.clientWidth,H=90;x.clearRect(0,0,W,H);
  const pts=ring.map(s=>s.process_rss_bytes/1048576).filter(v=>v>0);
  if(pts.length<2){x.fillStyle='#8b97a8';x.font='11px system-ui';x.fillText('collecting…',8,45);return}
  const max=Math.max(...pts),min=Math.min(...pts),range=(max-min)||1;
  x.beginPath();
  pts.forEach((v,i)=>{const px=i/(pts.length-1)*W;const py=H-6-((v-min)/range)*(H-12);i?x.lineTo(px,py):x.moveTo(px,py)});
  x.strokeStyle='#5aa2ff';x.lineWidth=2;x.stroke();
  x.fillStyle='#5aa2ff';x.fillText('peak '+max.toFixed(1)+' MB',8,12);
}
tick();setInterval(tick,1500);
</script>
</body>
</html>
"##;
