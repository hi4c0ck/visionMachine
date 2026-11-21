//! Tier-A configurable video adapter interpreter (expanded provider system,
//! plan .hermes/plans/2026-11-21_110654-video-adapter-multi-provider.md).
//!
//! PURE: (spec, stage ctx) -> wire payload; response JSON -> job state /
//! artifact URL / cost snapshot. No HTTP, no IO — fully unit-testable. The
//! engine (`provider.rs::run_video_adapter`) drives the create→poll→artifact
//! loop; this module owns the DATA interpretation. Logic-heavy uniques
//! (Agnes mode-fallback, ComfyUI workflow graphs) stay Tier-B code shapers —
//! never force-folded into this config (owner scope decision 2026-11-21).
//!
//! Payload template tokens (whole-string token = typed JSON substitution;
//! embedded token = string interpolation; unresolved optional = PRUNE):
//!   {{model}} {{prompt}} {{seconds}} (1-dec string) {{seconds:int}}
//!   {{seconds:str}} {{seconds:enum}} (snapped number) {{seconds:enumstr}}
//!   {{ratio}} {{size}} {{seed}} {{media:first}} {{media:last}} {{media:refs}}
//! Pruning: an object whose members ALL pruned vanishes (Luma keyframes on a
//! text-only run); array elements prune individually; a static {} / [] stays.

use std::collections::HashMap;

use serde_json::{json, Map, Value};

use crate::generation::shaper::{self, StageContext};
use crate::generation::specs::{AdapterEnvelopeWire, ModelSpecWire, VideoAdapterSpecWire};

/// Canonical job states the adapter statusMap translates vendor vocab into.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobState {
    Pending,
    Running,
    Succeeded,
    Failed,
    Cancelled,
    /// Queued behind a rate limit (Runway THROTTLED) — backoff, NOT an error.
    Throttled,
    /// Unmapped raw status: treated as running + logged (defensive, the
    /// Agnes engine's today-behavior for unknown statuses).
    Unknown,
}

pub fn job_state(raw: &str, map: &HashMap<String, String>) -> JobState {
    match map.get(raw).map(|s| s.as_str()) {
        Some("pending") => JobState::Pending,
        Some("running") => JobState::Running,
        Some("succeeded") => JobState::Succeeded,
        Some("failed") => JobState::Failed,
        Some("cancelled") => JobState::Cancelled,
        Some("throttled") => JobState::Throttled,
        _ => JobState::Unknown,
    }
}

/// Resolved parameter bag — built with the SAME guards as the Tier-B
/// shapers (resolve_target_size / guard_supported / format_seconds), so
/// catalog drift can never 400 (0012 D1 rule preserved for Tier A).
#[derive(Debug, Clone, Default)]
pub struct ResolvedParams {
    pub model: String,
    pub prompt: String,
    /// Clamped round-1 seconds, 1-dec string ("5.0") — E5 convention.
    pub seconds_1dec: String,
    /// Clamped round-1 seconds as a number.
    pub seconds_num: f64,
    /// Snapped to limits.secondsEnum (nearest; tie → smaller). None when
    /// the model declares no discrete durations.
    pub seconds_enum: Option<f64>,
    pub ratio: Option<String>,
    pub size: Option<String>,
    pub seed: Option<i64>,
    pub media_first: Option<String>,
    pub media_last: Option<String>,
    pub media_refs: Vec<String>,
}

pub fn resolve_params(spec: &ModelSpecWire, ctx: &StageContext) -> ResolvedParams {
    let (size, mut ratio) =
        shaper::resolve_target_size(spec, &ctx.resolution, &ctx.orientation, ctx.target_w, ctx.target_h);
    let (size, mut ratio) = shaper::guard_supported(spec, size, ratio);
    // 0012: an explicit session video-ratio override wins ONLY when
    // compatible with the orientation AND supported by the model (same
    // filter as the Tier-B shaper). A guarded-out override falls back to
    // the orientation map value — never to None.
    if let Some(r) = ctx.video_ratio.clone() {
        if shaper::ratio_compatible_with_orientation(&r, &ctx.orientation) {
            let (_, guarded) = shaper::guard_supported(spec, None, Some(r));
            if guarded.is_some() {
                ratio = guarded;
            }
        }
    }
    let seconds_1dec = shaper::format_seconds(ctx.length_frames, ctx.fps, spec.limits.seconds);
    let seconds_num: f64 = seconds_1dec.parse().unwrap_or(0.0);
    let seconds_enum = spec.limits.seconds_enum.as_ref().and_then(|list| {
        if list.is_empty() {
            return None;
        }
        // Nearest entry; tie → the smaller value (deterministic).
        let mut best: Option<(f64, f64)> = None; // (dist, value)
        for v in list {
            let dist = (v - seconds_num).abs();
            let better = match best {
                None => true,
                Some((bd, bv)) => dist < bd || (dist == bd && *v < bv),
            };
            if better {
                best = Some((dist, *v));
            }
        }
        best.map(|(_, v)| v)
    });
    let seed = spec.supports_seed().then(|| ctx.seed).flatten();
    let kfs: Vec<&String> = ctx
        .upstream
        .iter()
        .filter(|u| u.kind == "keyframe" && !u.primary.is_empty())
        .map(|u| &u.primary)
        .collect();
    let max_refs = spec
        .media
        .as_ref()
        .and_then(|m| m.max_refs)
        .unwrap_or(5) as usize;
    let media_refs: Vec<String> = ctx
        .upstream
        .iter()
        .filter(|u| u.kind == "subject" && !u.primary.is_empty())
        .take(max_refs)
        .map(|u| u.primary.clone())
        .collect();
    ResolvedParams {
        model: spec.id.clone(),
        prompt: ctx.prompt.clone(),
        seconds_1dec,
        seconds_num,
        seconds_enum,
        ratio,
        size,
        seed,
        media_first: kfs.first().map(|s| s.to_string()),
        media_last: kfs.get(1).map(|s| s.to_string()),
        media_refs,
    }
}

/// Resolve one token to its typed JSON value. `Ok(None)` = unresolved
/// optional → the caller prunes the field. Unknown token = concrete error.
fn token_value(name: &str, p: &ResolvedParams) -> Result<Option<Value>, String> {
    match name {
        "model" => Ok(Some(json!(p.model))),
        "prompt" => Ok(Some(json!(p.prompt))),
        "seconds" => Ok(Some(json!(p.seconds_1dec))),
        "seconds:int" => Ok(Some(json!(p.seconds_num.round() as i64))),
        "seconds:str" => Ok(Some(json!(format!("{}", p.seconds_num.round() as i64)))),
        "seconds:enum" => Ok(p.seconds_enum.map(|v| json!(v.round() as i64))),
        "seconds:enumstr" => Ok(p.seconds_enum.map(|v| json!(format!("{}", v.round() as i64)))),
        "ratio" => Ok(p.ratio.clone().map(|v| json!(v))),
        "size" => Ok(p.size.clone().map(|v| json!(v))),
        "seed" => Ok(p.seed.map(|v| json!(v))),
        "media:first" => Ok(p.media_first.clone().map(|v| json!(v))),
        "media:last" => Ok(p.media_last.clone().map(|v| json!(v))),
        "media:refs" => Ok(if p.media_refs.is_empty() {
            None
        } else {
            Some(json!(p.media_refs))
        }),
        other => Err(format!("unknown adapter token '{{{{{other}}}}}'")),
    }
}

/// Resolution outcome for one template node. `Static` = verbatim value (no
/// tokens); `Resolved` = a token produced this value; `Pruned` = an
/// unresolved optional token removed it. The distinction drives object
/// pruning: an object that lost a token member and has NO resolved-token
/// member left is a dead wrapper (Luma `{type:'image', url:<pruned>}`) and
/// vanishes entirely; an object with live token members (the payload root)
/// keeps its static fields.
enum Res {
    Static(Value),
    Resolved(Value),
    Pruned,
}

/// String leaf: whole-string token → typed value (Pruned when unresolved);
/// embedded tokens → interpolation (any unresolved → Pruned); no tokens →
/// Static.
fn resolve_string(s: &str, p: &ResolvedParams) -> Result<Res, String> {
    if let Some(name) = s.strip_prefix("{{").and_then(|r| r.strip_suffix("}}")) {
        if !name.contains("{{") {
            return Ok(match token_value(name, p)? {
                Some(v) => Res::Resolved(v),
                None => Res::Pruned,
            });
        }
    }
    if !s.contains("{{") {
        return Ok(Res::Static(json!(s)));
    }
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find("}}") else {
            return Err(format!("unclosed adapter token in '{s}'"));
        };
        let name = &after[..end];
        match token_value(name, p)? {
            Some(Value::String(sv)) => out.push_str(&sv),
            Some(other) => out.push_str(&other.to_string()),
            None => return Ok(Res::Pruned), // unresolved optional → prune
        }
        rest = &after[end + 2..];
    }
    out.push_str(rest);
    Ok(Res::Resolved(json!(out)))
}

fn resolve_node(v: &Value, p: &ResolvedParams) -> Result<Res, String> {
    match v {
        Value::String(s) => resolve_string(s, p),
        Value::Object(map) => {
            let mut out = Map::new();
            let mut had = false;
            let mut had_pruned = false;
            let mut had_token = false;
            for (k, val) in map {
                had = true;
                match resolve_node(val, p)? {
                    Res::Static(r) => {
                        out.insert(k.clone(), r);
                    }
                    Res::Resolved(r) => {
                        had_token = true;
                        out.insert(k.clone(), r);
                    }
                    Res::Pruned => {
                        had_pruned = true;
                    }
                }
            }
            // All members pruned → dead object. A token member pruned with
            // only static members left → dead wrapper (Luma frame shell).
            if had && (out.is_empty() || (had_pruned && !had_token)) {
                Ok(Res::Pruned)
            } else if had_token {
                Ok(Res::Resolved(Value::Object(out)))
            } else {
                Ok(Res::Static(Value::Object(out)))
            }
        }
        Value::Array(arr) => {
            let mut out = Vec::new();
            let mut had = false;
            let mut had_token = false;
            for val in arr {
                had = true;
                match resolve_node(val, p)? {
                    Res::Static(r) => out.push(r),
                    Res::Resolved(r) => {
                        had_token = true;
                        out.push(r);
                    }
                    Res::Pruned => {}
                }
            }
            if had && out.is_empty() {
                Ok(Res::Pruned)
            } else if had_token {
                Ok(Res::Resolved(Value::Array(out)))
            } else {
                Ok(Res::Static(Value::Array(out)))
            }
        }
        other => Ok(Res::Static(other.clone())),
    }
}

/// Build the wire payload from the per-model template + resolved params.
pub fn resolve_payload(template: &Value, p: &ResolvedParams) -> Result<Value, String> {
    match resolve_node(template, p)? {
        Res::Static(v) | Res::Resolved(v) => Ok(v),
        Res::Pruned => Err("adapter payload resolved to nothing (every field pruned)".to_string()),
    }
}

// ── Response interpretation (dot paths; numeric segments index arrays) ─────

pub fn read_path<'a>(v: &'a Value, path: &str) -> Option<&'a Value> {
    let mut cur = v;
    for seg in path.split('.') {
        if seg.is_empty() {
            return None;
        }
        cur = match cur {
            Value::Object(m) => m.get(seg)?,
            Value::Array(a) => a.get(seg.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(cur)
}

/// String at path; numbers stringify (MiniMax file_id is a string in the
/// query response and an integer at retrieve — both ride through here).
pub fn path_string(v: &Value, path: &str) -> Option<String> {
    match read_path(v, path)? {
        Value::String(s) if !s.is_empty() => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Number at path; numeric strings parse (Kling final_unit_deduction "4.0").
pub fn path_f64(v: &Value, path: &str) -> Option<f64> {
    match read_path(v, path)? {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse::<f64>().ok(),
        _ => None,
    }
}

/// Artifact URL at path: a string, the first element of a URL array
/// (Runway output[]), or the first element's `url` field when the array
/// holds objects (Kling task_result.videos[{url}]); a bare object with a
/// `url` field also resolves (Replicate output-object variants).
pub fn artifact_url(v: &Value, path: &str) -> Option<String> {
    fn url_of(v: &Value) -> Option<String> {
        match v {
            Value::String(s) if !s.is_empty() => Some(s.clone()),
            Value::Object(m) => m
                .get("url")
                .and_then(|u| u.as_str())
                .filter(|s| !s.is_empty())
                .map(String::from),
            _ => None,
        }
    }
    match read_path(v, path)? {
        Value::Array(a) => a.first().and_then(url_of),
        other => url_of(other),
    }
}

/// Business-error check on HTTP-200 bodies (Kling {code}, MiniMax
/// {base_resp:{status_code}}). None = OK. Numeric comparison tolerates
/// 0 vs 0.0 (serde u64/f64 number kinds).
pub fn envelope_error(v: &Value, env: &AdapterEnvelopeWire) -> Option<String> {
    let code = read_path(v, &env.code_path)?;
    let same = match (code.as_f64(), env.ok_value.as_f64()) {
        (Some(a), Some(b)) => a == b,
        _ => code == &env.ok_value,
    };
    if same {
        return None;
    }
    let msg = path_string(v, &env.message_path).unwrap_or_else(|| format!("code {code}"));
    Some(format!("provider error {code}: {msg}"))
}

/// Substitute {jobId} / {model} / {fileId} in an endpoint template.
pub fn substitute(template: &str, job_id: &str, model: &str, file_id: &str) -> String {
    template
        .replace("{jobId}", job_id)
        .replace("{model}", model)
        .replace("{fileId}", file_id)
}

/// Provider-reported cost + compute-time usage → the portable `cost` block
/// for output.json (pricing collection hook; P5-safe — costs are not secrets).
/// None when the vendor reports neither (static estimate rides separately).
pub fn cost_snapshot(resp: &Value, adapter: &VideoAdapterSpecWire) -> Option<Value> {
    let r = &adapter.response;
    let mut cost = Map::new();
    if let Some(rc) = &r.reported_cost {
        if let Some(v) = path_f64(resp, &rc.path) {
            cost.insert("reported".into(), json!({ "value": v, "unit": rc.unit }));
        }
    }
    if let Some(pt) = &r.predict_time_path {
        if let Some(v) = path_f64(resp, &pt) {
            cost.insert("usage".into(), json!({ "predictTimeSecs": v }));
        }
    }
    if cost.is_empty() {
        None
    } else {
        Some(Value::Object(cost))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::shaper::UpstreamOutput;
    use crate::generation::specs::{
        AdapterArtifactWire, AdapterCreateWire, AdapterPollWire, AdapterResponseWire,
        ModelSpecLimits, ModelSpecMedia,
    };

    fn spec() -> ModelSpecWire {
        serde_json::from_value(json!({
            "id": "m", "kind": "video", "endpoint": "/e", "sync": false,
            "requestFormat": "video-adapter"
        }))
        .unwrap()
    }

    fn ctx() -> StageContext {
        StageContext {
            prompt: "a cat".into(),
            length_frames: 121,
            fps: 24,
            resolution: "720p".into(),
            orientation: "horizontal".into(),
            target_w: 0,
            target_h: 0,
            image_size: None,
            image_ratio: None,
            video_ratio: None,
            c_value: 7.0,
            q_value: 18,
            seed: Some(42),
            source_kind: "video".into(),
            source_id: "p1".into(),
            image_type: None,
            reference_url: None,
            media_mode: None,
            upstream: Vec::new(),
        }
    }

    fn up(kind: &str, primary: &str) -> UpstreamOutput {
        UpstreamOutput {
            source_id: "s".into(),
            kind: kind.into(),
            primary: primary.into(),
            local_path: String::new(),
        }
    }

    fn params() -> ResolvedParams {
        ResolvedParams {
            model: "gen4.5".into(),
            prompt: "a cat".into(),
            seconds_1dec: "5.0".into(),
            seconds_num: 5.0,
            seconds_enum: Some(5.0),
            ratio: Some("1280:720".into()),
            size: Some("768P".into()),
            seed: Some(42),
            media_first: Some("https://cdn.test/k1.png".into()),
            media_last: None,
            media_refs: vec![],
        }
    }

    // ── payload resolution: typing + pruning ──

    #[test]
    fn runway_payload_golden() {
        let template = json!({
            "model": "{{model}}", "promptText": "{{prompt}}",
            "promptImage": "{{media:first}}", "ratio": "{{ratio}}",
            "duration": "{{seconds:int}}", "seed": "{{seed}}"
        });
        let p = resolve_payload(&template, &params()).unwrap();
        assert_eq!(p["model"], "gen4.5");
        assert_eq!(p["promptText"], "a cat");
        assert_eq!(p["promptImage"], "https://cdn.test/k1.png");
        assert_eq!(p["ratio"], "1280:720");
        // Whole-string {{seconds:int}} substitutes as a NUMBER (Runway int).
        assert_eq!(p["duration"], json!(5));
        assert_eq!(p["seed"], json!(42));
    }

    #[test]
    fn unresolved_optional_prunes_field_and_empty_objects() {
        let mut p = params();
        p.media_first = None;
        p.seed = None;
        // Luma-shaped: keyframes object vanishes entirely on a text-only run.
        let template = json!({
            "model": "{{model}}", "prompt": "{{prompt}}",
            "duration": "{{seconds:enum}}s",
            "keyframes": {
                "frame0": { "type": "image", "url": "{{media:first}}" },
                "frame1": { "type": "image", "url": "{{media:last}}" }
            }
        });
        let out = resolve_payload(&template, &p).unwrap();
        assert!(out.get("keyframes").is_none(), "pruned keyframes: {out}");
        // Embedded enum token interpolates: 5 → "5s".
        assert_eq!(out["duration"], "5s");
        assert_eq!(out["prompt"], "a cat");
    }

    #[test]
    fn partial_keyframes_keep_frame0_drop_frame1() {
        let template = json!({
            "keyframes": {
                "frame0": { "type": "image", "url": "{{media:first}}" },
                "frame1": { "type": "image", "url": "{{media:last}}" }
            }
        });
        let out = resolve_payload(&template, &params()).unwrap();
        assert_eq!(out["keyframes"]["frame0"]["url"], "https://cdn.test/k1.png");
        assert!(out["keyframes"].get("frame1").is_none());
    }

    #[test]
    fn static_fields_and_empty_containers_survive() {
        let template = json!({ "mode": "pro", "prompt_optimizer": true, "n": 1, "extra": {} });
        let out = resolve_payload(&template, &params()).unwrap();
        assert_eq!(out["mode"], "pro");
        assert_eq!(out["prompt_optimizer"], true);
        assert_eq!(out["n"], 1);
        assert_eq!(out["extra"], json!({}));
    }

    #[test]
    fn replicate_input_nesting_is_just_template_structure() {
        let template = json!({ "input": { "prompt": "{{prompt}}", "image": "{{media:first}}" } });
        let out = resolve_payload(&template, &params()).unwrap();
        assert_eq!(out["input"]["prompt"], "a cat");
        assert_eq!(out["input"]["image"], "https://cdn.test/k1.png");
    }

    #[test]
    fn enumstr_token_yields_string_kling_duration() {
        let template = json!({ "duration": "{{seconds:enumstr}}" });
        let out = resolve_payload(&template, &params()).unwrap();
        assert_eq!(out["duration"], json!("5"));
    }

    #[test]
    fn refs_token_yields_array_and_prunes_when_empty() {
        let mut p = params();
        p.media_refs = vec!["https://cdn.test/s1.png".into(), "https://cdn.test/s2.png".into()];
        let out = resolve_payload(&json!({ "images": "{{media:refs}}" }), &p).unwrap();
        assert_eq!(out["images"].as_array().unwrap().len(), 2);
        p.media_refs.clear();
        let out = resolve_payload(&json!({ "images": "{{media:refs}}", "prompt": "{{prompt}}" }), &p).unwrap();
        assert!(out.get("images").is_none());
    }

    #[test]
    fn unknown_token_is_a_concrete_error() {
        let err = resolve_payload(&json!({ "x": "{{bogus}}" }), &params()).unwrap_err();
        assert!(err.contains("bogus"), "{err}");
    }

    #[test]
    fn fully_pruned_payload_is_a_concrete_error() {
        let mut p = params();
        p.media_first = None;
        let err = resolve_payload(&json!({ "image": "{{media:first}}" }), &p).unwrap_err();
        assert!(err.contains("pruned"), "{err}");
    }

    // ── resolve_params: guard reuse ──

    #[test]
    fn params_reuse_tier_b_guards() {
        let mut s = spec();
        s.limits = ModelSpecLimits {
            seconds: Some([2.0, 10.0]),
            seconds_enum: Some(vec![5.0, 10.0]),
            ratios: Some(vec!["1280:720".into(), "720:1280".into()]),
            ratio_map: Some(HashMap::from([
                ("horizontal".to_string(), "1280:720".to_string()),
                ("vertical".to_string(), "720:1280".to_string()),
            ])),
            ..Default::default()
        };
        s.supports_seed = Some(true);
        s.media = Some(ModelSpecMedia {
            modes: vec!["keyframes".into()],
            max_keyframes: Some(2),
            max_refs: Some(3),
            ..Default::default()
        });
        let mut c = ctx();
        c.length_frames = 241; // 241/24 = 10.04 → clamp 10 → enum snap 10
        c.upstream = vec![
            up("keyframe", "https://cdn.test/k1.png"),
            up("keyframe", "https://cdn.test/k2.png"),
            up("subject", "https://cdn.test/s1.png"),
        ];
        let p = resolve_params(&s, &c);
        assert_eq!(p.seconds_1dec, "10.0");
        assert_eq!(p.seconds_enum, Some(10.0));
        assert_eq!(p.ratio.as_deref(), Some("1280:720"));
        assert_eq!(p.seed, Some(42));
        assert_eq!(p.media_first.as_deref(), Some("https://cdn.test/k1.png"));
        assert_eq!(p.media_last.as_deref(), Some("https://cdn.test/k2.png"));
        assert_eq!(p.media_refs.len(), 1);
        // Unsupported ratio drift is DROPPED by guard_supported (never 400).
        let mut c2 = ctx();
        c2.video_ratio = Some("21:9".into()); // not in the declared list
        let p2 = resolve_params(&s, &c2);
        assert_eq!(p2.ratio.as_deref(), Some("1280:720"));
    }

    #[test]
    fn enum_snap_tie_goes_to_smaller() {
        let mut s = spec();
        s.limits.seconds_enum = Some(vec![5.0, 9.0]);
        s.limits.seconds = Some([5.0, 9.0]);
        let mut c = ctx();
        c.length_frames = 168; // 7.0s — equidistant 5/9 → 5
        let p = resolve_params(&s, &c);
        assert_eq!(p.seconds_enum, Some(5.0));
    }

    #[test]
    fn seed_gated_by_supports_seed() {
        let s = spec(); // supports_seed absent
        let p = resolve_params(&s, &ctx());
        assert_eq!(p.seed, None);
    }

    // ── response interpretation ──

    #[test]
    fn dot_paths_with_array_indices() {
        let body = json!({ "data": { "task_result": { "videos": [{ "url": "https://cdn.test/v.mp4" }] } } });
        assert_eq!(
            artifact_url(&body, "data.task_result.videos").as_deref(),
            Some("https://cdn.test/v.mp4")
        );
        assert_eq!(
            artifact_url(&body, "data.task_result.videos.0.url").as_deref(),
            Some("https://cdn.test/v.mp4")
        );
        assert_eq!(path_string(&body, "data.missing"), None);
    }

    #[test]
    fn status_map_translates_vendor_vocab() {
        let map: HashMap<String, String> = HashMap::from([
            ("succeed".into(), "succeeded".into()),
            ("succeeded".into(), "succeeded".into()),
            ("THROTTLED".into(), "throttled".into()),
            ("dreaming".into(), "running".into()),
        ]);
        assert_eq!(job_state("succeed", &map), JobState::Succeeded);
        assert_eq!(job_state("succeeded", &map), JobState::Succeeded);
        assert_eq!(job_state("THROTTLED", &map), JobState::Throttled);
        assert_eq!(job_state("dreaming", &map), JobState::Running);
        assert_eq!(job_state("weird", &map), JobState::Unknown);
    }

    #[test]
    fn envelope_business_error_on_http_200() {
        let env = AdapterEnvelopeWire {
            code_path: "base_resp.status_code".into(),
            ok_value: json!(0),
            message_path: "base_resp.status_msg".into(),
        };
        let ok = json!({ "base_resp": { "status_code": 0, "status_msg": "success" } });
        assert!(envelope_error(&ok, &env).is_none());
        let bad = json!({ "base_resp": { "status_code": 1008, "status_msg": "insufficient balance" } });
        let err = envelope_error(&bad, &env).unwrap();
        assert!(err.contains("1008") && err.contains("insufficient balance"), "{err}");
        // Kling numeric-code envelope.
        let kenv = AdapterEnvelopeWire {
            code_path: "code".into(),
            ok_value: json!(0),
            message_path: "message".into(),
        };
        let kling = json!({ "code": 1002, "message": "Authentication error" });
        assert!(envelope_error(&kling, &kenv).unwrap().contains("1002"));
    }

    #[test]
    fn file_id_string_and_number_both_ride() {
        let s = json!({ "file_id": "12345" });
        let n = json!({ "file_id": 12345 });
        assert_eq!(path_string(&s, "file_id").as_deref(), Some("12345"));
        assert_eq!(path_string(&n, "file_id").as_deref(), Some("12345"));
    }

    #[test]
    fn cost_snapshot_credits_units_and_predict_time() {
        let mut adapter = VideoAdapterSpecWire {
            create: AdapterCreateWire { endpoint: "/c".into() },
            poll: AdapterPollWire { endpoint: "/p/{jobId}".into(), ..Default::default() },
            response: AdapterResponseWire {
                job_id_path: "id".into(),
                status_path: "status".into(),
                artifact: AdapterArtifactWire { mode: "url".into(), path: Some("output".into()), ..Default::default() },
                reported_cost: Some(crate::generation::specs::AdapterReportedCostWire {
                    path: "cost.credits".into(),
                    unit: "credits".into(),
                }),
                predict_time_path: Some("metrics.predict_time".into()),
                ..Default::default()
            },
            ..Default::default()
        };
        let runway = json!({ "cost": { "credits": 120 }, "metrics": { "predict_time": 31.5 } });
        let cost = cost_snapshot(&runway, &adapter).unwrap();
        assert_eq!(cost["reported"]["value"], json!(120.0));
        assert_eq!(cost["reported"]["unit"], "credits");
        assert_eq!(cost["usage"]["predictTimeSecs"], json!(31.5));
        // Kling units arrive as a decimal STRING.
        adapter.response.reported_cost = Some(crate::generation::specs::AdapterReportedCostWire {
            path: "data.final_unit_deduction".into(),
            unit: "units".into(),
        });
        adapter.response.predict_time_path = None;
        let kling = json!({ "data": { "final_unit_deduction": "4.0" } });
        let cost = cost_snapshot(&kling, &adapter).unwrap();
        assert_eq!(cost["reported"]["value"], json!(4.0));
        // No signals → None (honest unknown, never a fabricated number).
        assert!(cost_snapshot(&json!({}), &adapter).is_none());
    }

    #[test]
    fn substitute_templates() {
        assert_eq!(
            substitute("/{model}/requests/{jobId}/status", "req-1", "fal-ai/kling", ""),
            "/fal-ai/kling/requests/req-1/status"
        );
        assert_eq!(
            substitute("/v1/files/retrieve?file_id={fileId}", "", "", "999"),
            "/v1/files/retrieve?file_id=999"
        );
    }
}
