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
        let normalized = normalize_text(entry_text);
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
}
