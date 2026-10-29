//! The *layered* narrative — the expanded form of the user's intent.
//!
//! "Girl walks into forest" expands into *layers of content*:
//!
//! - **primary** — the user's main narrative, expanded (a girl, her walk).
//! - **secondary** — implied environment (the forest, the road, atmosphere
//!   grade, time-of-day light). These are *verbosities* the entry text
//!   implies but doesn't spell out.
//! - **ambient** — non-main content that lives on its own dynamics (birds
//!   moving independently, wind through the grass, a distant figure).
//!
//! Every layer carries `from: Vec<SpanId>` — provenance back to intent
//! clauses. The critic later checks: "did the novel cover every clause?"
//!
//! The LLM (provider-settings model) implements `LayeredExpander`; the
//! `PassthroughLayeredExpander` is the deterministic Phase-0-compatible
//! default (wraps the flat entry text into a single `primary` layer).

use crate::generation::video_flow::config::ExpandParams;
use crate::generation::video_flow::error::{FlowError, FlowResult};
use crate::generation::video_flow::intent::{IntentSnapshot, SpanId};
use crate::generation::video_flow::steps::{normalize_text, word_count};
use serde::{Deserialize, Serialize};

/// The kind of content a layer carries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LayerKind {
    /// The user's main narrative, expanded.
    Primary,
    /// Implied environment (forest, road, grade).
    Environment,
    /// Atmosphere / mood / light.
    Atmosphere,
    /// Lighting specifics.
    Lighting,
    /// Motion / camera language.
    Motion,
}

/// One layer of the narrative.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    pub kind: LayerKind,
    pub text: String,
    /// Provenance: which intent clause spans this layer was derived from.
    /// Empty for the deterministic stub (no provenance tracking yet).
    #[serde(default)]
    pub from: Vec<SpanId>,
}

/// Ambient content that moves on its own dynamics — not driven by the main
/// action. "Birds move on their own" is ambient even though the user said it;
/// the key is that it has an *independent* dynamic.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ambient {
    pub description: String,
    /// The independent dynamic (e.g. "wind shifts the canopy" not
    /// "the girl pushes through the trees").
    pub dynamics: String,
    #[serde(default)]
    pub from: Vec<SpanId>,
}

/// The layered narrative document.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Novel {
    pub step_version: u32,
    /// The primary layer — the user's main narrative, expanded.
    pub primary: Layer,
    /// Secondary layers: implied environment, atmosphere, lighting, etc.
    #[serde(default)]
    pub secondary: Vec<Layer>,
    /// Ambient elements with their own dynamics.
    #[serde(default)]
    pub ambient: Vec<Ambient>,
}

impl Novel {
    /// All layers (primary + secondary) as a flat list.
    pub fn all_layers(&self) -> Vec<&Layer> {
        let mut out = vec![&self.primary];
        out.extend(self.secondary.iter());
        out
    }

    /// The full word count of the primary + secondary layers (ambient is
    /// excluded — it's "other content", not the main narrative).
    pub fn narrative_word_count(&self) -> usize {
        self.all_layers().iter().map(|l| word_count(&l.text)).sum()
    }
}

/// Strategy seam: intent → layered narrative. The LLM (provider-settings
/// model) implements this; `PassthroughLayeredExpander` is the deterministic
/// Phase-0 default.
pub trait LayeredExpander: Send + Sync {
    fn expand(&self, intent: &IntentSnapshot, cfg: &ExpandParams) -> FlowResult<Novel>;
}

/// Deterministic default: wraps the flat entry text into a single `primary`
/// layer. No secondary/ambient layers (those are what the LLM adds). This
/// keeps the Phase-0 pipeline fully testable without any model dependency.
pub struct PassthroughLayeredExpander;

impl LayeredExpander for PassthroughLayeredExpander {
    fn expand(&self, intent: &IntentSnapshot, cfg: &ExpandParams) -> FlowResult<Novel> {
        let text = normalize_text(&intent.entry_text);
        if text.is_empty() {
            return Err(FlowError::EmptyInput);
        }
        let words = word_count(&text);
        if cfg.min_novel_words > 0 && words < cfg.min_novel_words {
            return Err(FlowError::text_output(format!(
                "expansion too small: {words} words < min {}",
                cfg.min_novel_words
            )));
        }
        if cfg.max_novel_chars > 0 {
            let chars = text.chars().count();
            if chars > cfg.max_novel_chars {
                return Err(FlowError::text_output(format!(
                    "expansion too large: {chars} chars > max {}",
                    cfg.max_novel_chars
                )));
            }
        }
        // Build the provenance: all clause span ids from the intent.
        let all_spans: Vec<SpanId> = intent
            .clauses
            .iter()
            .enumerate()
            .filter_map(|(i, _)| intent.clause_span(i))
            .collect();

        Ok(Novel {
            step_version: cfg.step_version,
            primary: Layer {
                kind: LayerKind::Primary,
                text,
                from: all_spans,
            },
            secondary: Vec::new(),
            ambient: Vec::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A narrative that clears the default 40-word floor.
    const LONG: &str = "a red fox darts through the tall pine forest at dusk as golden light \
                        spills across the meadow and a distant river catches the fading sun in \
                        long slow reflections while the wind moves the dry grass and the whole \
                        valley settles into quiet evening";

    fn intent() -> IntentSnapshot {
        IntentSnapshot::new(LONG)
    }

    fn cfg() -> ExpandParams {
        ExpandParams::default()
    }

    #[test]
    fn passthrough_produces_single_primary_layer() {
        let novel = PassthroughLayeredExpander.expand(&intent(), &cfg()).unwrap();
        assert_eq!(novel.primary.kind, LayerKind::Primary);
        assert_eq!(novel.primary.text, normalize_text(LONG));
        assert!(novel.secondary.is_empty(), "no secondary in the deterministic stub");
        assert!(novel.ambient.is_empty(), "no ambient in the deterministic stub");
    }

    #[test]
    fn passthrough_carries_clause_spans_in_from() {
        let novel = PassthroughLayeredExpander.expand(&intent(), &cfg()).unwrap();
        // The primary layer's `from` should carry all clause span ids.
        assert!(!novel.primary.from.is_empty(), "provenance must not be empty");
        let span0 = SpanId::new("clause-0");
        assert!(novel.primary.from.contains(&span0), "first clause span present");
    }

    #[test]
    fn short_expansion_fails_word_floor() {
        let short = IntentSnapshot::new("a fox");
        let mut c = cfg();
        c.min_novel_words = 40;
        let err = PassthroughLayeredExpander.expand(&short, &c).unwrap_err();
        assert!(matches!(err, FlowError::TextOutput(ref m) if m.contains("too small")));
    }

    #[test]
    fn empty_input_fails() {
        let empty = IntentSnapshot::new("   ");
        let err = PassthroughLayeredExpander.expand(&empty, &cfg()).unwrap_err();
        assert_eq!(err, FlowError::EmptyInput);
    }

    #[test]
    fn novel_is_wire_round_trippable() {
        let novel = PassthroughLayeredExpander.expand(&intent(), &cfg()).unwrap();
        let json = serde_json::to_value(&novel).unwrap();
        let back: Novel = serde_json::from_value(json).unwrap();
        assert_eq!(back.primary.text, novel.primary.text);
        assert_eq!(back.primary.from.len(), novel.primary.from.len());
    }

    #[test]
    fn all_layers_and_word_count_are_consistent() {
        let novel = PassthroughLayeredExpander.expand(&intent(), &cfg()).unwrap();
        assert_eq!(novel.all_layers().len(), 1, "passthrough has one layer");
        assert_eq!(
            novel.narrative_word_count(),
            word_count(&novel.primary.text),
            "word count = primary word count when no secondary"
        );
    }
}
