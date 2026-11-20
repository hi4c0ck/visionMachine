//! Step 1 (expand): raw entry text → expanded narrative.
//!
//! The LLM expander lands behind `TextExpander` later; `PassthroughExpander` is
//! the deterministic default so the whole pipeline is testable end-to-end
//! today. The step enforces concrete text-output invariants (word floor / char
//! ceiling) and fails fast with a named error instead of a silent pass.

use crate::generation::video_flow::config::ExpandParams;
use crate::generation::video_flow::error::{FlowError, FlowResult};
use serde::{Deserialize, Serialize};

/// Collapse intra-line whitespace to single spaces while PRESERVING line
/// breaks. Line structure is significant to the marker grammar (each marker
/// lives at the start of a line), so the flow's normalization must not merge
/// lines. This is the one normalization shared by every step.
pub fn normalize_text(raw: &str) -> String {
    raw
        .lines()
        .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// Count whitespace-separated words of a normalized string.
pub fn word_count(text: &str) -> usize {
    text.split_whitespace().count()
}

/// Output of the expand step: a validated narrative + the version that produced it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpandResult {
    pub step_version: u32,
    pub novel: String,
}

/// Strategy seam: entry text → expanded narrative.
pub trait TextExpander: Send + Sync {
    fn expand(&self, raw: &str, seed: Option<i64>) -> FlowResult<String>;
}

/// No-op expander: the "novel" is the normalized raw text. Deterministic, so the
/// harness and its tests run without any LLM dependency.
pub struct PassthroughExpander;

impl TextExpander for PassthroughExpander {
    fn expand(&self, raw: &str, _seed: Option<i64>) -> FlowResult<String> {
        Ok(normalize_text(raw))
    }
}

/// Enforce the narrative's text-output invariants. Every violation is a
/// concrete, version-aware error (never a silent pass-through).
pub fn validate_novel(novel: &str, cfg: &ExpandParams) -> FlowResult<()> {
    let trimmed = normalize_text(novel);
    if trimmed.is_empty() {
        return Err(FlowError::text_output("expanded novel is empty".to_string()));
    }
    let words = word_count(&trimmed);
    if cfg.min_novel_words > 0 && words < cfg.min_novel_words {
        return Err(FlowError::text_output(format!(
            "expansion too small: {words} words < min {}",
            cfg.min_novel_words
        )));
    }
    let chars = trimmed.chars().count();
    if cfg.max_novel_chars > 0 && chars > cfg.max_novel_chars {
        return Err(FlowError::text_output(format!(
            "expansion too large: {chars} chars > max {}",
            cfg.max_novel_chars
        )));
    }
    Ok(())
}

/// Run step 1. The input is re-normalized and checked non-empty before the
/// strategy is invoked, so an empty entry is a real `EmptyInput` error.
pub fn expand_raw_text(
    raw: &str,
    expander: &dyn TextExpander,
    cfg: &ExpandParams,
) -> FlowResult<ExpandResult> {
    if normalize_text(raw).is_empty() {
        return Err(FlowError::EmptyInput);
    }
    let novel = expander.expand(raw, cfg.seed)?;
    validate_novel(&novel, cfg)?;
    Ok(ExpandResult {
        step_version: cfg.step_version,
        novel,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg_min(min_words: usize, max_chars: usize) -> ExpandParams {
        ExpandParams {
            min_novel_words: min_words,
            max_novel_chars: max_chars,
            ..Default::default()
        }
    }

    /// 45 words so it clears the default floor of 40.
    const LONG: &str = "a red fox darts through the tall pine forest at dusk as golden light spills across \
                        the meadow and a distant river catches the fading sun in long slow reflections while \
                        the wind moves the dry grass and the whole valley settles into quiet evening";

    #[test]
    fn empty_input_is_named() {
        assert_eq!(
            expand_raw_text("   ", &PassthroughExpander, &cfg_min(0, 0)).unwrap_err(),
            FlowError::EmptyInput
        );
    }

    #[test]
    fn short_expansion_fails_word_floor() {
        let err = expand_raw_text("a fox", &PassthroughExpander, &cfg_min(40, 0)).unwrap_err();
        assert!(matches!(err, FlowError::TextOutput(ref m) if m.contains("too small")));
    }

    #[test]
    fn long_expansion_fails_char_ceiling() {
        let big = "lorem ipsum dolor sit amet ".repeat(2000);
        let err = expand_raw_text(&big, &PassthroughExpander, &cfg_min(0, 1000)).unwrap_err();
        assert!(matches!(err, FlowError::TextOutput(ref m) if m.contains("too large")));
    }

    #[test]
    fn valid_expansion_returns_normalized_novel() {
        let out = expand_raw_text(LONG, &PassthroughExpander, &cfg_min(40, 0)).unwrap();
        assert_eq!(out.step_version, 1);
        assert_eq!(word_count(&out.novel), 45);
        // Whitespace collapsed to single spaces.
        assert!(!out.novel.contains("  "));
    }

    /// A failing strategy (an LLM slot not wired) surfaces a named error.
    struct StubFailing;
    impl TextExpander for StubFailing {
        fn expand(&self, _raw: &str, _s: Option<i64>) -> FlowResult<String> {
            Err(FlowError::LlmNotConfigured)
        }
    }

    #[test]
    fn strategy_failure_propagates() {
        assert_eq!(
            expand_raw_text(LONG, &StubFailing, &cfg_min(40, 0)).unwrap_err(),
            FlowError::LlmNotConfigured
        );
    }
}
