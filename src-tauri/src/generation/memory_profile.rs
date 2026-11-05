//! Per-stage memory profiler — the honest answer to "which generation step
//! eats how much RAM".
//!
//! Before this module existed, `sysinfo` was a declared dependency with ZERO
//! call sites: we had no way to attribute process RSS to a generation stage.
//! This closes that gap with a bounded, allocation-light sampler:
//!
//!   * one fresh `sysinfo::System` per sample, refreshed with
//!     `refresh_memory()` (cheap: memory-status query) +
//!     `refresh_processes(Some(&[pid]), …)` (OUR process only, not a
//!     full process-table scan),
//!   * a fixed-capacity ring buffer of `MemorySample`s (no unbounded growth),
//!   * a sample taken at every provider stage transition (image / video /
//!     download / compose / terminal) via `sample()`.
//!
//! Each sample records: process resident-set (RSS) bytes, system total/
//! available memory, the generation stage that just changed, the active task
//! count, and — when available — the JS-heap snapshot the renderer reports
//! for the same stage. Correlating the two sides per stage is what tells us
//! *which* step grows the *process* and *which* grows the *renderer*,
//! instead of guessing.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sysinfo::{Pid, ProcessesToUpdate};

/// One ring-buffer sample: a memory snapshot tied to a generation stage.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySample {
    /// Unix ms when the sample was taken.
    pub ts_ms: u64,
    /// The generation stage this sample is attributed to
    /// ("image-request" | "image-download" | "video-poll" | "video-download" |
    ///  "compose-copy" | "compose-reencode" | "terminal" | ...).
    pub stage: String,
    /// Number of generation tasks active at the moment of the sample.
    pub active_tasks: u32,
    /// Process resident-set size in bytes (0 if unavailable).
    pub process_rss_bytes: u64,
    /// System total memory in bytes (0 if unavailable).
    pub total_memory_bytes: u64,
    /// System available memory in bytes (0 if unavailable).
    pub free_memory_bytes: u64,
    /// A renderer-reported `performance.memory.usedJSHeapSize` snapshot for
    /// the same stage, when the frontend correlated it (null otherwise).
    pub js_heap_bytes: Option<u64>,
}

/// Bounded profiler. The ring buffer has a hard cap so the diagnostic
/// structure itself can never be the leak.
#[derive(Debug)]
pub struct MemoryProfiler {
    samples: Mutex<VecDeque<MemorySample>>,
    cap: usize,
}

impl Default for MemoryProfiler {
    fn default() -> Self {
        Self::new()
    }
}

impl MemoryProfiler {
    pub fn new() -> Self {
        Self {
            samples: Mutex::new(VecDeque::new()),
            cap: 512,
        }
    }

    /// Read process RSS + system memory now. Both refreshes are bounded:
    /// memory-status query + a refresh scoped to OUR pid (no process-table
    /// scan), so a sample costs a handful of syscalls, not an allocation
    /// storm.
    fn read_memory() -> (u64, u64, u64) {
        let pid = Pid::from_u32(std::process::id());
        let mut sys = sysinfo::System::new();
        sys.refresh_memory();
        let total = sys.total_memory();
        let free = sys.available_memory();
        sys.refresh_processes(ProcessesToUpdate::Some(&[pid]), false);
        let rss = sys
            .process(pid)
            .map(|p| p.memory())
            .unwrap_or(0);
        (rss, total, free)
    }

    /// On-demand probe: read process RSS + system memory NOW without storing
    /// it in the ring buffer. This is what the in-app RAM monitor chip uses
    /// (a passive, generation-free sample) so it never pollutes the
    /// stage-attributed ring buffer.
    pub fn probe() -> (u64, u64, u64) {
        Self::read_memory()
    }

    /// Record one sample tied to a stage. `js_heap_bytes` lets the renderer
    /// correlate its own heap to the same stage; pass `None` from the backend.
    pub fn sample(&self, stage: &str, active_tasks: u32, js_heap_bytes: Option<u64>) {
        let (rss, total, free) = Self::read_memory();
        let sample = MemorySample {
            ts_ms: now_unix_ms(),
            stage: stage.to_string(),
            active_tasks,
            process_rss_bytes: rss,
            total_memory_bytes: total,
            free_memory_bytes: free,
            js_heap_bytes,
        };
        let mut buf = match self.samples.lock() {
            Ok(b) => b,
            Err(e) => e.into_inner(), // poison-tolerant: diagnostics never drop.
        };
        buf.push_back(sample);
        while buf.len() > self.cap {
            buf.pop_front();
        }
    }

    /// The full ring buffer, newest last. Bounded by `cap`.
    pub fn snapshot(&self) -> Vec<MemorySample> {
        self.samples
            .lock()
            .map(|b| b.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// A compact summary for a log line: first/peak RSS across the buffer
    /// PLUS the stage where the peak happened — the log file answers
    /// "which generation step grew the process" without needing the
    /// per-sample read command yet.
    pub fn summary_line(&self) -> String {
        let buf = self.snapshot();
        if buf.is_empty() {
            return "no memory samples yet".into();
        }
        let first = buf[0].process_rss_bytes;
        let (peak, peak_stage) = buf
            .iter()
            .max_by_key(|s| s.process_rss_bytes)
            .map(|s| (s.process_rss_bytes, s.stage.clone()))
            .unwrap_or((0, "?".into()));
        let delta = peak.saturating_sub(first);
        format!(
            "mem {} samples · rss first {}MB → peak {}MB at \"{}\" (Δ {}MB)",
            buf.len(),
            first / 1024 / 1024,
            peak / 1024 / 1024,
            peak_stage,
            delta / 1024 / 1024,
        )
    }
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_buffer_is_bounded() {
        let p = MemoryProfiler::new();
        for i in 0..1200 {
            p.sample(&format!("s{i}"), 1, None);
        }
        assert!(p.snapshot().len() <= p.cap, "the buffer must not grow past its cap");
        // The most recent sample is kept.
        assert_eq!(p.snapshot().last().unwrap().stage, "s1199");
    }

    #[test]
    fn sample_records_rss_and_stage() {
        let p = MemoryProfiler::new();
        p.sample("video-download", 3, Some(1234));
        let s = p.snapshot();
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].stage, "video-download");
        assert_eq!(s[0].active_tasks, 3);
        assert_eq!(s[0].js_heap_bytes, Some(1234));
        // Total memory should be non-zero on any sane host.
        assert!(s[0].total_memory_bytes > 0);
        // RSS should be measurable for our own process.
        assert!(s[0].process_rss_bytes > 0);
    }
}
