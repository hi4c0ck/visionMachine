//! S1 Node A through the app's text provider (harness llm.json contract).
//!
//! "Production: read from VisionMachine Settings providers (the active
//! profile's providers.text.baseURL + apiKey + model)." This module is that
//! production path: one chat-completions call (OpenAI-compatible,
//! `response_format: json_schema`) with the harness Node A system prompt,
//! the strict `VisualNovel` response schema (mirrored from
//! `fixtures/node_a.request.json`), and count repair to the seed scale.
//!
//! Failure is never silent: any error returns `Err(reason)` and the
//! caller keeps the deterministic template novel + records the named
//! fallback (`ExpansionSource::Template` + note). No retries beyond the
//! harness `llm.json` (attempts = 2), no LLM key ever logged.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::generation::video_flow::engine::seed::EngineEntry;
use crate::generation::video_flow::engine::tree::{brief_block, StructuralTree};
use crate::generation::video_flow::engine::types::VisualNovel;

/// The app's text provider slot (Settings → Providers → Text):
/// `base_url + /v1/chat/completions`, bearer key, model id.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextProvider {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

/// Hard cap for one Node A expansion call (kept off the flow's DB lock;
/// 4500-token generation on agnes-flash is ~20–40 s in practice).
pub const NODE_A_TIMEOUT_SECS: u64 = 60;

/// POST target: the provider base URL trimmed of a trailing slash + the
/// catalog text endpoint (URL option "a" from provider.rs).
pub fn chat_url(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    format!("{base}/v1/chat/completions")
}

/// Node A's strict response schema (mirrored from
/// `harness/fixtures/node_a.request.json` — the shape the model is
/// constrained to, so parsing below is total: every field is required,
/// every enum is closed).
fn visual_novel_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["film", "scenes"],
        "properties": {
            "film": {
                "type": "object",
                "additionalProperties": false,
                "required": ["title", "logline", "style", "world", "palette", "time_of_day", "weather"],
                "properties": {
                    "title": { "type": "string" },
                    "logline": { "type": "string" },
                    "style": { "type": "string" },
                    "world": { "type": "string" },
                    "palette": { "type": "string" },
                    "time_of_day": { "enum": ["dawn", "morning", "midday", "afternoon", "evening", "night"] },
                    "weather": { "type": "string" }
                }
            },
            "scenes": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["title", "prose", "shots"],
                    "properties": {
                        "title": { "type": "string" },
                        "prose": { "type": "string" },
                        "hand_off": {
                            "type": "string",
                            "description": "One sentence: the state this scene LEAVES the story in, so the next clip can open on it (the cross-clip connectivity line)."
                        },
                        "shots": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 5,
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["prose", "beats"],
                                "properties": {
                                    "prose": { "type": "string" },
                                    "beats": {
                                        "type": "array",
                                        "items": { "type": "string" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    })
}

/// Node A's system prompt (harness `config/nodes.yaml` node_a.prompt,
/// condensed to the fixture's single-block form).
const NODE_A_SYSTEM: &str = "You are the film director. From the FilmSeed, write a saturated VISUAL NOVEL: the film's world/palette/time_of_day/weather, then each scene and each shot as dense, sensory visual prose (light, texture, sound, motion, color, weather, emotion). Rules:\n- Output ONE JSON object. Only the schema fields, nothing else.\n- Keep every string under 300 characters. No repeated phrases. Do not list exclusions or negations — just describe what IS present.\n- Each shot's `beats` must be 2-4 CINEMATIC MICRO-CUES, each written as `<shot-size>: <subject> <motion> — <light/sound detail>`, concrete and sensory. No generic filler.\n- Each scene's `hand_off` is ONE short sentence: the state this scene LEAVES the story in (principal + place + what just happened), so the NEXT clip can open on that exact state. It is the cross-clip connectivity line — never invent a new plot point here, only describe the ending state the following scene must pick up.\n- Never put on-screen text, subtitles, or UI into the prose.";

/// The Node A chat-completions request body: system + user prompts
/// (seed JSON, genre style, creative profile + sensory axes, hard counts)
/// and the strict structured-output schema. Deterministic — a pure
/// builder so tests can pin the wire shape without a network.
///
/// Phase 2: when `tree` is `Some`, the S0.5 structural brief
/// (`brief_block`) is injected into the user prompt — the "brief, not a
/// cage": it fixes the shape (scene count, driver, target duration, per-
/// scene energy + transition intent + chained temp arc, continuity
/// thread) and leaves prose / environment / character / beats to the
/// model. A soft duration-conformance line tells the model the target
/// total runtime WITHOUT hard-failing (the tree is advisory; S5 repair
/// still owns the counts). `tree == None` keeps the pre-Phase-2 prompt
/// byte-stable (the `node_a_body_matches_fixture_contract` pin).
pub fn node_a_request_body(
    entry: &EngineEntry,
    model: &str,
    tree: Option<&StructuralTree>,
) -> Value {
    use crate::generation::video_flow::engine::seed::MoodProfile;

    let mood_line = MoodProfile::for_mood(entry.mood).directive();
    // Phase 2: the structural brief + soft duration note (only when a tree
    // is attached; otherwise an empty string so the prompt is unchanged).
    // Stage 1 (2026-11-14): the duration note now carries the SATURATION
    // budget — how many prose words must FILL the awaited runtime — so the
    // story length the model writes matches the run's clip count × clip
    // length, not a fixed prose amount repeated per clip.
    let (brief, duration_note): (String, String) = match tree {
        Some(t) => {
            let clips = (t.branches.len() * t.branches.first().map(|b| b.shots.max(1) as usize).unwrap_or(1)).max(1) as u32;
            let clip_s = entry.scale.clip_s[0].max(4);
            let (_, wpc, total_words) =
                crate::generation::video_flow::engine::tree::saturation_budget(clips, clip_s);
            (
                brief_block(t),
                format!(
                    "Target total runtime is ~{}s across {clips} clips (~{clip_s}s each); the story must FILL it: write ~{wpc} dense words of visual prose PER CLIP (~{total_words} total across the whole film). Pace each scene's prose to its clip's share of the runtime — do NOT write one fixed block and repeat it, and do NOT pad with filler. The scene/shot COUNTS below are hard; the S5 repair fixes any count drift.",
                    t.root.target_duration_s
                ),
            )
        }
        None => (String::new(), String::new()),
    };
    let user = format!(
        "FilmSeed: {seed}\n\
         genre style: \"{style}\"\n\
         creative profile: cinema (temp 0.5, detail medium, sensory axes: light,color,motion,sound,texture,weather)\n\
         Hard counts: scenes.length == {scenes}, scenes[*].shots.length == {shots}.\n\
         G0 look axes (they govern the S2/S4 light: prefer them unless the story clearly moves through the day): \
         time_of_day={tod}, weather={weather}.\n\
         {mood_line}\n\
         {brief}{duration_note}\
         Respond with a single JSON object matching the VisualNovel schema only.",
        seed = serde_json::to_value(entry).unwrap_or(json!(entry)),
        style = entry.genre.style,
        scenes = entry.scale.scenes,
        shots = entry.scale.shots_per_scene,
        tod = entry.time_of_day,
        weather = entry.weather,
        mood_line = mood_line,
        brief = brief,
        duration_note = duration_note,
    );
    json!({
        "model": model,
        "temperature": 0.5,
        "max_tokens": 4500,
        "chat_template_kwargs": { "enable_thinking": false },
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "VisualNovel",
                "strict": true,
                "schema": visual_novel_schema()
            }
        },
        "messages": [
            { "role": "system", "content": NODE_A_SYSTEM },
            { "role": "user", "content": user }
        ]
    })
}

/// Total parse: the Agnes envelope nests `data.choices[0].message.content`,
/// vanilla OpenAI uses `choices[0]`, and a permissive server may return
/// the bare VisualNovel object. `content` is the full HTTP response body
/// (parsed JSON) or a bare VisualNovel value. Returns `Ok(VisualNovel)`
/// or a named reason (the caller turns it into the fallback note).
pub fn parse_novel(content: &Value) -> Result<VisualNovel, String> {
    // 1) Agnes / OpenAI envelope → dig to the message content string.
    if content.get("data").is_some() || content.get("choices").is_some() {
        let inner = content
            .get("data")
            .and_then(|d| d.get("choices"))
            .or_else(|| content.get("choices"))
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("message"))
            .and_then(|m| m.get("content"))
            .ok_or("response has no choices[0].message.content")?;
        let text = match inner {
            Value::String(s) => s.clone(),
            other => other.to_string(), // some servers embed the object
        };
        return parse_novel_string(&text);
    }
    // 2) Bare VisualNovel object.
    let mut novel =
        serde_json::from_value::<VisualNovel>(content.clone())
            .map_err(|e| format!("response is not a VisualNovel object: {e}"))?;
    sanitize_novel(&mut novel);
    Ok(novel)
}

/// The model's *content* string (or an embedded object) → VisualNovel,
/// tolerating ```json fences. LLM narrative strings are sanitized at
/// ingress (B15) so foreign-glyph + repetition-loop degeneration never
/// reaches a flow doc.
fn parse_novel_string(text: &str) -> Result<VisualNovel, String> {
    let stripped = text.trim().trim_start_matches("```json").trim_start_matches("```").trim();
    let mut novel =
        serde_json::from_str::<VisualNovel>(stripped)
            .map_err(|e| format!("VisualNovel JSON parse failed: {e}"))?;
    sanitize_novel(&mut novel);
    Ok(novel)
}

/// B15 (2026-11-18): sanitize LLM-authored narrative strings at parse
/// ingress, so the two observed generation failures (agnes-2.5-flash)
/// never reach downstream layers (section text, pipe prompts, flow
/// docs):
///   1. foreign-script glyph hallucination — `hinting脆弱ness` (CJK
///      bolted into English mid-word),
///   2. repetition-loop degeneration at the tail — `elsewherewhere`
///      (glued) / `holds, holds, holds` (spaced).
///
/// The prompt already asks for "No repeated phrases", but the model
/// doesn't honor it under saturation pressure — the sanitizer is the
/// deterministic guarantee. Pure + byte-stable: clean text passes
/// through UNCHANGED, and the deterministic template novel never flows
/// through `parse_novel` at all, so golden prompts stay byte-stable.
pub fn sanitize_novel(n: &mut VisualNovel) {
    let f = &mut n.film;
    sanitize_str(&mut f.title);
    sanitize_str(&mut f.logline);
    sanitize_str(&mut f.style);
    sanitize_str(&mut f.world);
    sanitize_str(&mut f.palette);
    sanitize_str(&mut f.time_of_day);
    sanitize_str(&mut f.weather);
    for sc in n.scenes.iter_mut() {
        sanitize_str(&mut sc.title);
        sanitize_str(&mut sc.prose);
        if let Some(h) = sc.hand_off.as_mut() {
            sanitize_str(h);
        }
        for sh in sc.shots.iter_mut() {
            sanitize_str(&mut sh.prose);
            for b in sh.beats.iter_mut() {
                sanitize_str(b);
            }
        }
    }
}

fn sanitize_str(s: &mut String) {
    let cleaned = clean_narrative(s);
    if cleaned != *s {
        *s = cleaned;
    }
}

/// Clean one LLM narrative string: drop foreign-script glyphs, collapse
/// glued token repeats inside a word, cut a spaced repetition loop at
/// the tail. Clean input returns byte-identical (the caller keeps the
/// original when nothing changed).
fn clean_narrative(s: &str) -> String {
    // The style's typographic set survives alongside plain ASCII.
    const KEEP_EXTRA: [char; 7] = [
        '…', '—', '–', '·', '\u{2019}', '\u{201c}', '\u{201d}',
    ];
    let foreign = s
        .chars()
        .any(|c| !(c.is_ascii() || KEEP_EXTRA.contains(&c)));

    // 1) Per-word glued-repetition collapse ("elsewherewherewhere." →
    //    "elsewhere."). Trailing punctuation is kept off the check.
    fn trail_punct(t: &str) -> &str {
        t.trim_end_matches(|c: char| {
            matches!(c, '.' | ',' | '!' | '?' | ';' | '…' | '—' | '–' | '·')
        })
    }
    let trail = trail_punct;
    let words: Vec<&str> = s.split_whitespace().collect();
    let mut words_changed = false;
    let mut cleaned_words: Vec<String> = Vec::with_capacity(words.len());
    for w in &words {
        let t = trail(w);
        let core: String = if foreign {
            // Strip foreign glyphs first so the repeat check sees ASCII.
            t.chars()
                .filter(|c| c.is_ascii() || KEEP_EXTRA.contains(c))
                .collect()
        } else {
            t.to_string()
        };
        let collapsed = collapse_glued_repeats(&core);
        if collapsed != core {
            words_changed = true;
        }
        // Trailing punctuation of the ORIGINAL word (kept off `core`),
        // reattached after the collapsed core.
        let wchars: Vec<char> = w.chars().collect();
        let trail_start = wchars
            .iter()
            .rposition(|c| {
                !matches!(c, '.' | ',' | '!' | '?' | ';' | '…' | '—' | '–' | '·')
            })
            .map(|i| i + 1)
            .unwrap_or(0);
        let trail_str: String = wchars[trail_start..].iter().collect();
        cleaned_words.push(format!("{collapsed}{trail_str}"));
    }

    // 2) Spaced tail loop ("…holds, holds, holds." → "…holds.").
    let norm = |t: &str| trail(t).to_lowercase();
    let mut tail_run = 1usize;
    if words.len() >= 2 {
        let last = norm(words.last().unwrap());
        let mut i = words.len() - 1;
        while i > 0 && !last.is_empty() && norm(words[i - 1]) == last {
            i -= 1;
            tail_run += 1;
        }
    }
    if !foreign && !words_changed && tail_run < 2 {
        return s.to_string(); // byte-identical clean path
    }
    let mut out: String = if foreign {
        cleaned_words
            .iter()
            .filter(|w| !w.is_empty())
            .map(|w| {
                w.chars()
                    .filter(|c| c.is_ascii() || KEEP_EXTRA.contains(c))
                    .collect::<String>()
            })
            .filter(|w| !w.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        cleaned_words.join(" ")
    };
    if tail_run >= 2 {
        // Keep the FIRST occurrence, drop the rest; trim its trailing
        // clause mark, re-attach a terminal mark only if the original
        // ended on one.
        let kept: Vec<&str> = cleaned_words[..words.len() - (tail_run - 1)]
            .iter()
            .filter(|w| !w.is_empty())
            .map(|w| w.as_str())
            .collect();
        out = kept
            .join(" ")
            .trim_end_matches(|c: char| matches!(c, ',' | ';' | '—' | '–'))
            .to_string();
        if s.chars()
            .filter(|c| !c.is_whitespace())
            .last()
            .is_some_and(|c| matches!(c, '.' | '!' | '?' | '…'))
        {
            out.push('.');
        }
    }
    out
}

/// Truncate a word that ends in a glued repeated suffix S (|S| ≥ 3,
/// repeated ≥ 2×) down to prefix + S once: "elsewherewherewhere" →
/// "elsewhere". No common English word ends in a glued 3+ char repeat,
/// so this only fires on degeneration (unit-tested against false
/// positives).
fn collapse_glued_repeats(w: &str) -> String {
    let b = w.as_bytes();
    let mut end = b.len();
    loop {
        let n_max = end / 2;
        if n_max < 3 {
            break;
        }
        let mut found = false;
        for n in (3..=n_max).rev() {
            let s = end - n;
            // word ends with S·S iff b[s-n..s] == b[s..end]
            if b[s - n..s] == b[s..end] {
                end = s; // keep prefix + one S
                found = true;
                break;
            }
        }
        if !found {
            break;
        }
    }
    if end == b.len() {
        w.to_string()
    } else {
        String::from_utf8(b[..end].to_vec())
            .unwrap_or_else(|_| w.to_string())
    }
}
/// `scenes.length == seed.scale.scenes`, `shots.length ==
/// seed.scale.shotsPerScene`. The LLM may under/over-produce; repair
/// deterministically (truncate / repeat the last valid item) so S2–S5
/// counts stay consistent with the G0 scale. Empty prose is rejected
/// (V1 would name it, but a better failure is a named repair error).
pub fn repair_counts(novel: &mut VisualNovel, entry: &EngineEntry) -> Result<(), String> {
    let want_scenes = entry.scale.scenes as usize;
    let want_shots = entry.scale.shots_per_scene as usize;
    if novel.scenes.is_empty() {
        return Err("LLM returned zero scenes".into());
    }
    // Shots first (per scene), then scene count.
    for sc in novel.scenes.iter_mut() {
        if sc.shots.is_empty() {
            return Err("LLM returned a scene with zero shots".into());
        }
        sc.shots.truncate(want_shots.max(1));
        while sc.shots.len() < want_shots {
            let last = sc.shots.last().cloned().ok_or("empty shot list")?;
            sc.shots.push(last);
        }
    }
    novel.scenes.truncate(want_scenes.max(1));
    while novel.scenes.len() < want_scenes {
        let last = novel.scenes.last().cloned().ok_or("empty scene list")?;
        novel.scenes.push(last);
    }
    Ok(())
}

/// One Node A expansion through the provider. Two attempts
/// (harness `llm.json` retry: attempts=2); on a `response_format`
/// capability error the retry drops `response_format` and asks for plain
/// JSON (the fixture's `fallback_mode_on_unsupported`).
/// Phase 2: `tree` is the S0.5 structural brief injected into the prompt
/// (the "brief, not a cage"); `None` keeps the pre-Phase-2 prompt.
pub async fn expand_node_a(
    provider: &TextProvider,
    entry: &EngineEntry,
    tree: Option<&StructuralTree>,
) -> Result<VisualNovel, String> {
    use reqwest::Client;

    if provider.base_url.trim().is_empty() {
        return Err("text provider has no base_url".into());
    }
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(NODE_A_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("http client: {e}"))?;
    let url = chat_url(&provider.base_url);

    let mut last_err = String::new();
    for attempt in 0..2u32 {
        let mut body = node_a_request_body(entry, &provider.model, tree);
        if attempt == 1 {
            // Capability fallback (llm.json: response_format unsupported).
            body.as_object_mut().unwrap().remove("response_format");
            let msgs = body["messages"].as_array().cloned().unwrap_or_default();
            let user = msgs
                .iter()
                .find(|m| m["role"] == "user")
                .and_then(|m| m["content"].as_str())
                .unwrap_or("");
            body["messages"] = Value::Array(vec![
                json!({ "role": "system", "content": NODE_A_SYSTEM }),
                json!({ "role": "user", "content": format!("{user}\nReturn raw JSON only (response_format is unavailable).") }),
            ]);
        }
        let mut req = client.post(&url).json(&body);
        if !provider.api_key.trim().is_empty() {
            req = req.bearer_auth(provider.api_key.trim());
        }
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            last_err = format!("HTTP {status}: {}", text.chars().take(200).collect::<String>());
            // A 4xx that is NOT a capability miss (429 aside) is terminal
            // enough: one retry is the harness contract, then stop.
            if status.as_u16() == 400 || status.as_u16() == 422 {
                // May be the response_format capability miss — the retry
                // (attempt 1) drops it and asks for plain JSON.
                if attempt == 0 {
                    continue;
                }
            }
            return Err(last_err);
        }
        let parsed: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                last_err = format!("response is not JSON: {e}");
                continue;
            }
        };
        match parse_novel(&parsed) {
            Ok(mut novel) => {
                if let Err(e) = repair_counts(&mut novel, entry) {
                    last_err = e;
                    continue; // one repair-retry is enough; then fallback
                }
                return Ok(novel);
            }
            Err(e) => {
                last_err = e;
                continue;
            }
        }
    }
    Err(last_err)
}

// ── Tests: pure, no network ────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::video_flow::engine::types::{Genre, SeedScale};

    fn entry() -> EngineEntry {
        EngineEntry {
            title: "Test".into(),
            idea: "a girl walks the forest".into(),
            input_text: Some("a girl walks the forest".into()),
            genre: Genre {
                name: "Cinematic".into(),
                style: "cinematic natural light".into(),
            },
            ratio: "16:9".into(),
            scale: SeedScale {
                scenes: 2,
                shots_per_scene: 3,
                clip_s: [8, 10],
            },
            time_of_day: "evening".into(),
            weather: "light drizzle".into(),
            mood: 50,
            overrides: Default::default(),
        }
    }

    #[test]
    fn chat_url_composes_catalog_shape() {
        assert_eq!(chat_url("https://apihub.agnes-ai.com"), "https://apihub.agnes-ai.com/v1/chat/completions");
        assert_eq!(chat_url("https://x.example/"), "https://x.example/v1/chat/completions");
    }

    fn visual_novel_json() -> Value {
        json!({
            "film": { "title": "T", "logline": "L", "style": "S", "world": "W", "palette": "P", "time_of_day": "evening", "weather": "rain" },
            "scenes": []
        })
    }

    #[test]
    fn node_a_body_matches_fixture_contract() {
        let e = entry();
        let body = node_a_request_body(&e, "agnes-2.5-flash", None);
        assert_eq!(body["model"], "agnes-2.5-flash");
        assert_eq!(body["max_tokens"], 4500);
        assert_eq!(body["response_format"]["json_schema"]["name"], "VisualNovel");
        assert_eq!(body["response_format"]["json_schema"]["strict"], true);
        let user = body["messages"][1]["content"].as_str().unwrap();
        assert!(user.contains("scenes.length == 2"), "hard counts in the prompt");
        assert!(user.contains("time_of_day=evening"), "G0 look axes in the prompt");
        // Phase 2 legacy pin: tree=None keeps the pre-Phase-2 prompt
        // (no structural brief, no duration note).
        assert!(
            !user.contains("Structural brief"),
            "tree:None must NOT carry the structural brief"
        );
        assert!(
            !user.contains("Target total runtime"),
            "tree:None must NOT carry the duration note"
        );
    }

    /// Phase 2 pin: with a tree attached, the S0.5 structural brief + the
    /// soft duration-conformance line are injected into the Node A user
    /// prompt (the "brief, not a cage" — the model sees the fixed shape,
    /// not a per-shot cage), while the hard counts stay the schema's.
    #[test]
    fn node_a_body_injects_structural_brief_when_tree_present() {
        use crate::generation::video_flow::engine::tree::build_structural_tree;
        use crate::generation::video_flow::intent::IntentSnapshot;

        let e = entry();
        let intent = IntentSnapshot::new(&e.idea);
        let tree = build_structural_tree(&intent, &e, &e.overrides);
        let body = node_a_request_body(&e, "agnes-2.5-flash", Some(&tree));
        let user = body["messages"][1]["content"].as_str().unwrap();
        assert!(
            user.contains("Structural brief"),
            "the brief block must be injected: {user}"
        );
        assert!(
            user.contains("Target total runtime"),
            "the soft duration note must be injected: {user}"
        );
        // The brief names the driver + thesis (the tree root's fields).
        assert!(
            user.contains(&tree.root.driver.as_str()) || !tree.root.thesis.is_empty(),
            "the brief must carry the tree root's driver/thesis"
        );
        // The hard counts still govern the schema (the brief never relaxes
        // the scene/shot counts).
        assert!(user.contains("scenes.length == 2"), "hard counts survive the brief injection");
    }

    /// Stage 1 pin (2026-11-14): the duration note carries the SATURATION
    /// budget — per-clip words derived from the clip count × clip length —
    /// so the LLM fills the awaited runtime instead of repeating one fixed
    /// prose block per clip. A longer runtime (more clips) must demand a
    /// higher total word budget in the prompt.
    #[test]
    fn node_a_duration_note_carries_saturation_budget() {
        use crate::generation::video_flow::engine::tree::build_structural_tree;
        use crate::generation::video_flow::intent::IntentSnapshot;

        fn body_for(scenes: u32, shots: u32) -> String {
            let mut e = entry();
            e.scale = crate::generation::video_flow::engine::types::SeedScale {
                scenes,
                shots_per_scene: shots,
                clip_s: [8, 10],
            };
            let intent = IntentSnapshot::new(&e.idea);
            let tree = build_structural_tree(&intent, &e, &e.overrides);
            node_a_request_body(&e, "agnes-2.5-flash", Some(&tree))
                .to_string()
        }

        let short = body_for(2, 2); // 4 clips × 32 words = 128
        let long = body_for(3, 3); // 9 clips × 32 words = 288
        assert!(short.contains("dense words of visual prose PER CLIP"), "per-clip budget present: {short}");
        assert!(short.contains("~128 total across"), "4 clips × 32 words = 128 total: {short}");
        assert!(long.contains("PER CLIP"), "per-clip budget present in the longer run: {long}");
        assert!(long.contains("~288 total across"), "9 clips × 32 words = 288 total: {long}");
    }

    /// Stage 2 pin: the VisualNovel schema carries the optional `hand_off`
    /// scene field (the LLM-authored connectivity line; absent = the
    /// deterministic fallback fires at assembly time).
    #[test]
    fn visual_novel_schema_carries_optional_hand_off() {
        let schema = visual_novel_schema();
        let scene_props = schema["properties"]["scenes"]["items"]["properties"].as_object().unwrap();
        assert!(
            scene_props.contains_key("hand_off"),
            "the scene schema must expose the optional hand_off field"
        );
        // Not required (older responses + the template path omit it).
        let required: Vec<String> = schema["properties"]["scenes"]["items"]["required"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect();
        assert!(
            !required.contains(&"hand_off".to_string()),
            "hand_off must stay optional: {required:?}"
        );
        // And a scene WITHOUT hand_off still deserializes (serde default),
        // so older LLM responses + the template path keep working.
        let bare: Result<crate::generation::video_flow::engine::types::NovelScene, _> =
            serde_json::from_value(
                json!({
                    "title": "S", "prose": "p", "shots": [ {"prose": "q", "beats": ["b"]} ]
                }),
            );
        assert!(bare.is_ok(), "a scene without hand_off must parse (serde default)");
        assert!(bare.unwrap().hand_off.is_none(), "absent hand_off deserializes to None");
    }

    #[test]
    fn parse_agnes_envelope() {
        let envelope = json!({
            "data": { "choices": [ { "message": { "content": visual_novel_json().to_string() } } ] }
        });
        let novel = parse_novel(&envelope).unwrap();
        assert_eq!(novel.film.logline, "L");
    }

    #[test]
    fn parse_openai_envelope_and_fenced_json() {
        let v = visual_novel_json();
        let openai = json!({ "choices": [ { "message": { "content": v.to_string() } } ] });
        assert!(parse_novel(&openai).is_ok());
        let inner = v.to_string();
        let fenced_content = format!("```json\n{inner}");
        let fenced = json!({ "data": { "choices": [ { "message": { "content": fenced_content } } ] } });
        assert!(parse_novel(&fenced).is_ok());
        // Bare VisualNovel object (a permissive server skips the envelope).
        assert!(parse_novel(&v).is_ok());
    }

    /// B15: the sanitizer cuts the two observed generation failures at
    /// parse ingress — foreign-script glyph hallucination and
    /// repetition-loop degeneration (glued + spaced) — while clean text
    /// passes byte-identical (golden stability).
    #[test]
    fn sanitize_cuts_foreign_glyphs_and_repetition_loops() {
        // The user-reported failure, verbatim (CJK bolted into a word +
        // glued tail loop):
        let dirty = "wide: twin spheres float side-by-side — lightning flash reveals tiny cracks forming along edges hinting脆弱ness yet ignored completely by occupants focused entirely elsewherewherewhere.";
        let out = clean_narrative(dirty);
        assert!(!out.contains('脆'), "foreign glyph stripped: {out}");
        assert!(!out.contains("wherewhere"), "glued loop collapsed: {out}");
        assert!(out.ends_with("elsewhere."), "tail intact and clean: {out}");

        // Clean text (typographic set included) passes byte-identical.
        let clean = "wide: twin spheres float side-by-side — lightning flash reveals tiny cracks · dusk light";
        assert_eq!(clean_narrative(clean), clean);

        // Spaced tail loop: keep the first occurrence, drop the rest,
        // re-attach the terminal mark.
        assert_eq!(
            clean_narrative("the light holds, holds, holds."),
            "the light holds."
        );
        assert_eq!(clean_narrative("the hum fades, fades."), "the hum fades.");
        assert_eq!(
            clean_narrative("the hum fades."),
            "the hum fades.",
            "a single token is untouched"
        );

        // No false positives on common words (no English word ends in a
        // glued 3+ char repeat).
        for w in ["bookkeeper", "banana", "mississippi", "tandem", "repetition", "elsewhere", "side-by-side"] {
            assert_eq!(clean_narrative(w), w, "false positive on {w}");
        }
    }

    /// B15: parse ingress sanitizes — a dirty beat in a bare VisualNovel
    /// object comes back clean (both envelope paths funnel through the
    /// same sanitizer).
    #[test]
    fn parse_novel_sanitizes_at_ingress() {
        let v = json!({
            "film": { "title": "T", "logline": "l", "style": "s", "world": "w", "palette": "p", "time_of_day": "night", "weather": "rain" },
            "scenes": [{
                "title": "S1",
                "prose": "the spheres drift — light holds, holds, holds.",
                "hand_off": "the light 脆弱 cools to dusk.",
                "shots": [{ "prose": "p.", "beats": ["wide: a sphere drifts — light settles, settles, settles."] }]
            }]
        });
        let novel = parse_novel(&v).unwrap();
        assert_eq!(
            novel.scenes[0].shots[0].beats[0],
            "wide: a sphere drifts — light settles."
        );
        assert_eq!(
            novel.scenes[0].prose,
            "the spheres drift — light holds."
        );
        assert_eq!(
            novel.scenes[0].hand_off.as_deref(),
            Some("the light cools to dusk."),
            "foreign glyph stripped from hand_off"
        );
    }

    #[test]
    fn repair_counts_truncates_and_repeats() {
        let mut novel: VisualNovel = serde_json::from_value(json!({
            "film": { "title": "T", "logline": "L", "style": "S", "world": "W", "palette": "P", "time_of_day": "midday", "weather": "clear" },
            "scenes": [
                { "title": "S1", "prose": "p", "shots": [ {"prose": "a", "beats": ["b"]}, {"prose": "b", "beats": ["b"]}, {"prose": "c", "beats": ["b"]}, {"prose": "d", "beats": ["b"]}, {"prose": "e", "beats": ["b"]} ] }
            ]
        }))
        .unwrap();
        let e = entry(); // 2 scenes x 3 shots
        repair_counts(&mut novel, &e).unwrap();
        assert_eq!(novel.scenes.len(), 2);
        assert_eq!(novel.scenes[0].shots.len(), 3);
        assert_eq!(novel.scenes[1].shots.len(), 3);
    }

    #[test]
    fn repair_counts_rejects_empty() {
        let mut novel: VisualNovel = serde_json::from_value(json!({
            "film": { "title": "T", "logline": "L", "style": "S", "world": "W", "palette": "P", "time_of_day": "midday", "weather": "clear" },
            "scenes": []
        }))
        .unwrap();
        assert!(repair_counts(&mut novel, &entry()).is_err());
    }
}
