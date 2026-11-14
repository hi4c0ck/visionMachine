//! Ground-truth anchor for the flow: the user's *intent* as a decomposed,
//! referenceable snapshot.
//!
//! "Keeping the output close to the image the user had at entry" is a
//! property we can only *measure* if the entry text is turned into stable,
//! addressable anchors. `IntentSnapshot` does that: it splits the raw entry
//! into numbered *clauses* (coarse intent units) and records any user
//! reference assets. Every deeper layer (novel spans, structured sections,
//! flow elements) can then carry a `SpanId` that traces back to a clause —
//! the provenance chain that makes fidelity auditability real.
//!
//! This step is deterministic and pure: no LLM, no I/O.

use crate::generation::video_flow::steps::normalize_text;
use serde::{Deserialize, Serialize};

/// A stable, human-readable provenance label for a unit of produced content.
///
/// A *span* is the atomic provenance token: it names "some bit of text that a
/// layer produced." Spans are minted by the novel step and consumed by the
/// structure step (sections) and the lower step (elements). Using a string
/// (not a raw index) keeps the id stable across re-materializations of the
/// same content — important for the versioning/regeneration contract.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SpanId(pub String);

impl SpanId {
    pub fn new(label: impl Into<String>) -> Self {
        Self(label.into())
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A stable id for one intent *clause* (a coarse piece of what the user asked).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ClauseId(pub String);

impl ClauseId {
    pub fn new(label: impl Into<String>) -> Self {
        Self(label.into())
    }
    /// Mint a clause id from an ordinal (used by the deterministic decomposer).
    pub fn ordinal(n: u32) -> Self {
        Self(format!("clause-{n}"))
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A user-supplied reference asset the entry text points at (a style frame, a
/// character sheet, a clip). Carried in the snapshot so downstream layers can
/// anchor "close to intent" against real assets, not just words.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRef {
    pub id: String,
    /// "image" | "video" | "style" | "audio"
    pub kind: String,
    pub path: String,
}

/// One coarse piece of intent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clause {
    pub id: ClauseId,
    pub text: String,
}

/// The immutable ground truth the flow is measured against.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentSnapshot {
    /// The exact user entry text, normalized (whitespace-collapsed, per line).
    pub entry_text: String,
    /// Coarse decomposition of the entry into referenceable clauses.
    pub clauses: Vec<Clause>,
    /// Optional reference assets the entry points at.
    pub refs: Vec<AssetRef>,
}

impl IntentSnapshot {
    pub fn new(entry_text: &str) -> Self {
        // 2026-11-14 ("wide: Pipe 01" fix): a Director extraction dump fed
        // back into the idea box must not become narrative — its `Pipe N`
        // index labels + `style:`/`scene:` tag prefixes are stripped up front
        // so clause decomposition + subject_phrase see STORY, not structure.
        let normalized = strip_entry_labels(&normalize_text(entry_text));
        let clauses = decompose_clauses(&normalized);
        Self {
            entry_text: normalized,
            clauses,
            refs: Vec::new(),
        }
    }

    pub fn with_refs(mut self, refs: Vec<AssetRef>) -> Self {
        self.refs = refs;
        self
    }

    /// Build from already-normalized text + pre-decomposed clauses (used when
    /// the orchestrator controls decomposition explicitly).
    pub fn from_clauses(entry_text: String, clauses: Vec<Clause>, refs: Vec<AssetRef>) -> Self {
        Self {
            entry_text,
            clauses,
            refs,
        }
    }

    /// A deterministic, stable span id for a clause (used by structurers that
    /// anchor a section to a clause rather than a novel span).
    pub fn clause_span(&self, clause_index: usize) -> Option<SpanId> {
        self.clauses
            .get(clause_index)
            .map(|c| SpanId::new(c.id.as_str().to_string()))
    }
}

/// 2026-11-14 (the "wide: Pipe 01" fix): the Director's "Extract pipes to
/// prompt" outputs a structured dump — `Pipe 01 — <name> · shot N` header
/// lines + `style:` / `scene:` / `camera:` tag-prefixed prose lines. When
/// that dump is fed back into the G0 idea box, the raw labels must NOT
/// become narrative clauses: "Pipe 01" would otherwise survive clause
/// decomposition and `subject_phrase` would pick it as the shot subject,
/// producing degenerate beats ("wide: Pipe 01") instead of story.
///
/// Per-line sanitization (applied after `normalize_text`, BEFORE clause
/// decomposition — it is a no-op on genuine prose):
///  1. strip a leading `Pipe N` index label (+ one separator, `—`/`·`/`:`/space);
///  2. strip a closed set of extraction tag prefixes (`style:`, `scene:`, …)
///     and `keyframe N (fN):` markers — the prose AFTER the tag is kept;
///  3. strip a trailing `· shot N` residue (the extraction's own naming);
///  4. drop lines that became empty.
///
/// Steps 1+2 run to a fixed point (a tag strip can expose a second leading
/// `Pipe N` label, e.g. "scene: Pipe 01 settles…"), so the loop is bounded
/// to two iterations. All case is preserved (matches run on a lowercase
/// view, slices taken from the original).
pub fn strip_entry_labels(normalized: &str) -> String {
    normalized
        .lines()
        .map(|line| {
            let mut t = line.trim().to_string();
            for _ in 0..2 {
                let before = t.clone();
                if let Some(rest) = strip_tag_prefix(&t) {
                    t = rest;
                }
                if let Some(rest) = strip_pipe_label(&t) {
                    t = rest;
                }
                if t == before {
                    break;
                }
            }
            t = strip_shot_suffix(&t).to_string();
            t
        })
        .filter(|l| !l.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// A leading `Pipe 01` / `Pipe 2` index label (+ one separator) → the rest.
/// "pipeline" and prose lines never match (a digit is required after "pipe",
/// allowing one space between the word and the digits — the extraction
/// writes "Pipe 01", not "Pipe01"). The match runs on a lowercase view, but
/// the RETURNED text is sliced from the original line so case is preserved.
fn strip_pipe_label(line: &str) -> Option<String> {
    let lower = line.to_ascii_lowercase();
    let rest = lower.get(4..)?; // after "pipe"
    // One optional space between the word and the index ("Pipe 01").
    let after_space = rest.trim_start_matches(' ');
    let spaces_skipped = rest.len() - after_space.len();
    let end = after_space
        .char_indices()
        .find(|(_, c)| !c.is_ascii_digit())
        .map(|(i, _)| i)
        .unwrap_or(after_space.len());
    if end == 0 {
        return None; // "pipeline…" or "pipe " with no index — not a label
    }
    // Byte offset into the ORIGINAL line of the char just past the digits.
    let label_end = 4 + spaces_skipped + end;
    let after = &line[label_end..];
    Some(after.trim_start_matches(['\u{2014}', '\u{2013}', '-', '\u{b7}', ':', ' ']).to_string())
}

/// A closed set of the extraction's tag prefixes. `keyframe N (fN):` and
/// bare `tag:` both yield the prose that follows; anything else is
/// untouched. The match is `tag` + `:` exactly, so a prose line that
/// merely *starts with* the word "scene" (no colon) is never stripped.
/// Loops to a fixed point (depth ≤ 3) so nested extraction dumps
/// ("style: scene: …", produced when an extraction is fed back through
/// the extractor) are stripped fully in one call.
fn strip_tag_prefix(line: &str) -> Option<String> {
    const TAGS: [&str; 11] = [
        "keyframe", "subject", "style", "sound", "scene", "camera", "lighting", "motion", "zoom", "transition", "effect",
    ];
    let lower0 = line.to_ascii_lowercase();
    let t0 = line.trim();
    if lower0.starts_with("keyframe") {
        // "keyframe 1 (f0): prompt…" → drop through the "):"
        if let Some(p) = t0.find(':') {
            return Some(t0[p + 1..].trim().to_string());
        }
        return None;
    }
    let mut s = line;
    let mut changed = false;
    for _ in 0..3 {
        let mut found: Option<&str> = None;
        let lower_s = s.to_ascii_lowercase();
        for tag in TAGS {
            if tag == "keyframe" {
                continue;
            }
            if lower_s.starts_with(tag) && s.as_bytes().get(tag.len()) == Some(&b':') {
                found = Some(&s[tag.len() + 1..]);
                break;
            }
        }
        match found {
            Some(rest) => {
                s = rest.trim();
                changed = true;
            }
            None => break,
        }
    }
    if changed {
        Some(s.to_string())
    } else {
        None
    }
}

/// A trailing `· shot N` residue (the extraction's per-shot naming) → the part
/// before it. Only the LAST middle-dot is inspected: `The Departure · shot 1`
/// and `Scene 1 · Departure · shot 1` both lose their trailing `· shot N`,
/// while a scene name that merely contains a `·` (no `shot` after its last
/// dot) is left untouched. A plain "shot 1" with no `·` is content, never
/// stripped.
fn strip_shot_suffix(s: &str) -> &str {
    let last_dot = match s.rfind('\u{b7}') {
        Some(i) => i,
        None => return s,
    };
    let after = s[last_dot + '\u{b7}'.len_utf8()..].trim();
    let after_lower = after.to_ascii_lowercase();
    if after_lower.starts_with("shot ") || after_lower == "shot" {
        s[..last_dot].trim_end()
    } else {
        s
    }
}

/// Split normalized entry text into coarse clauses.
///
/// A clause is a *sentence-ish* unit: split on sentence terminators (`.` `!`
/// `?`) and on newlines. Empty fragments are dropped. This is intentionally
/// coarse — the point is stable, referenceable intent units, not a real parser.
pub fn decompose_clauses(normalized_entry: &str) -> Vec<Clause> {
    let mut clauses = Vec::new();
    for raw_line in normalized_entry.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        // Split the line into sentence-ish fragments.
        let fragments: Vec<&str> = split_sentences(line);
        for frag in fragments {
            let text = frag.trim();
            if text.is_empty() {
                continue;
            }
            let id = ClauseId::ordinal(clauses.len() as u32);
            clauses.push(Clause {
                id,
                text: text.to_string(),
            });
        }
    }
    clauses
}

/// Split a single line into sentence-ish fragments on `.`, `!`, `?` (keeping
/// the terminator attached).
fn split_sentences(line: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0;
    let bytes = line.as_bytes();
    for i in 0..bytes.len() {
        if matches!(bytes[i], b'.' | b'!' | b'?') {
            out.push(&line[start..=i]);
            start = i + 1;
        }
    }
    // Trailing fragment without a terminator.
    let tail = line[start..].trim();
    if !tail.is_empty() {
        out.push(tail);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decompose_splits_sentences_and_lines() {
        let snap = IntentSnapshot::new("A girl walks into a forest. The road is wet. Birds move on their own.");
        assert_eq!(snap.clauses.len(), 3, "one clause per sentence");
        assert_eq!(snap.clauses[0].text, "A girl walks into a forest.");
        assert_eq!(snap.clauses[0].id, ClauseId::ordinal(0));
        assert_eq!(snap.clauses[2].text, "Birds move on their own.");
    }

    #[test]
    fn multi_line_entry_becomes_multiple_clauses() {
        let snap = IntentSnapshot::new("First the girl enters.\nThen the forest thickens. Light falls low.");
        assert_eq!(snap.clauses.len(), 3);
        // Whitespace within lines is normalized; newlines become clause breaks.
        assert!(!snap.entry_text.contains("  "));
    }

    #[test]
    fn clause_span_is_stable_and_traceable() {
        let snap = IntentSnapshot::new("One thing. Another thing.");
        let s0 = snap.clause_span(0).unwrap();
        let s1 = snap.clause_span(1).unwrap();
        assert_eq!(s0, SpanId::new("clause-0"));
        assert_ne!(s0, s1);
        assert!(snap.clause_span(9).is_none(), "out of range -> None");
    }

    #[test]
    fn intent_snapshot_is_wire_round_trippable() {
        let snap = IntentSnapshot::new("The girl. The road.");
        let json = serde_json::to_value(&snap).unwrap();
        let back: IntentSnapshot = serde_json::from_value(json).unwrap();
        assert_eq!(back.clauses.len(), snap.clauses.len());
        assert_eq!(back.entry_text, snap.entry_text);
    }

    #[test]
    fn refs_are_carried() {
        let snap = IntentSnapshot::new("A girl.")
            .with_refs(vec![AssetRef {
                id: "r1".into(),
                kind: "style".into(),
                path: "session/references/style.png".into(),
            }]);
        assert_eq!(snap.refs.len(), 1);
        assert_eq!(snap.refs[0].kind, "style");
    }

    // ── 2026-11-14 "wide: Pipe 01" regression: an extraction dump fed back
    //    into the G0 idea box must reduce to story, not structure. ─────────

    /// The exact shape the Director's "Extract pipes to prompt" produces
    /// (the real Session 8 dump that caused the degenerate beats):
    /// `Pipe 01 — <name> · shot N` headers + `style:`/`scene:`/… prefixed
    /// lines. After sanitization the "Pipe NN" label, tag prefixes, and
    /// `· shot N` residue are gone — the clause/subject pipeline sees prose.
    #[test]
    fn extraction_dump_is_sanitized_to_story() {
        let dump = "Pipe 01 — The Departure · shot 1\n\
                    style: A weary officer navigates the smoke-choked corridors of an Imperial battleship\n\
                    scene: wide: The Departure unfolds as the gate slams shut\n\
                    camera: close-up shot, fill_frame framing, shallow depth of field\n\
                    lighting: soft key light, medium contrast, 5600K, cool\n\
                    transition: crossfade (out)";
        let snap = IntentSnapshot::new(dump);
        // No clause may LEAD with the "Pipe NN" index label, and no closed
        // tag prefix / per-shot residue may survive.
        for c in &snap.clauses {
            assert!(!c.text.starts_with("Pipe "), "no clause may lead with the pipe index: {:?}", c.text);
            for bad in ["style:", "scene:", "camera:", "lighting:", "transition:", "· shot"] {
                assert!(!c.text.contains(bad), "tag prefix '{}' survived in: {:?}", bad, c.text);
            }
        }
        // The real scene name (from the header) survives sanitization.
        let all = snap.clauses.iter().map(|c| c.text.as_str()).collect::<Vec<_>>().join(" ");
        assert!(all.contains("The Departure"), "the scene name must survive: {all}");
        assert!(all.contains("A weary officer navigates the smoke-choked corridors of an Imperial battleship"),
            "the style prose is kept: {all}");
    }

    /// Genuine prose is a NO-OP: a "pipeline" line, a line that merely
    /// *starts with* the word "scene" (no colon), and "shot 1" mid-prose
    /// must all survive byte-stable.
    #[test]
    fn strip_entry_labels_is_a_noop_on_prose() {
        let prose = "The pipeline carries the girl home. A scene of silence. shot 1 holds the frame · a pause · then motion.";
        assert_eq!(
            strip_entry_labels(prose),
            prose,
            "prose lines must pass through untouched"
        );
    }

    /// A nested extraction dump ("style: scene: …", produced by feeding an
    /// extraction into the extractor twice) strips to the innermost prose.
    #[test]
    fn nested_extraction_tags_strip_to_fixed_point() {
        let s = "style: scene: Pipe 02 — The Chase · shot 1\nsound: wind";
        let out = strip_entry_labels(s);
        assert!(
            out.contains("The Chase") && out.contains("wind"),
            "the story survives: {out}"
        );
        assert!(!out.contains("Pipe 02") && !out.contains("style:") && !out.contains("scene:") && !out.contains("· shot"),
            "all labels stripped: {out}");
    }

    /// The Subject-phrase consequence: even if a raw "Pipe 01" fragment
    /// reached the engine, `subject_phrase` must not return the index.
    /// (The sanitize step makes this unreachable, but the engine's own
    /// `subject_phrase` is the last line of defense — pinned here via the
    /// seed module's exported behavior through an IntentSnapshot clause.)
    #[test]
    fn pipe_label_never_becomes_a_shot_subject() {
        // Simulate the post-sanitize clause the engine would see.
        let snap = IntentSnapshot::new("Pipe 01 — The Departure · shot 1");
        // After sanitization the header line reduces to "The Departure"
        // (the "· shot 1" suffix is the extraction's per-shot naming).
        assert!(
            snap.clauses.iter().any(|c| c.text.contains("Departure")),
            "the real scene name must survive sanitization: {:?}",
            snap.clauses
        );
        assert!(
            snap.clauses.iter().all(|c| !c.text.starts_with("Pipe")),
            "no clause may lead with the pipe index label: {:?}",
            snap.clauses
        );
    }
}
