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

    /// LLM-free template expansion steered by G0 look axes. The default
    /// ignores `look` (passthrough semantics); `TemplateLayeredExpander`
    /// overrides it to fill the secondary + ambient layers deterministically.
    fn expand_with_look(
        &self,
        intent: &IntentSnapshot,
        cfg: &ExpandParams,
        look: &LookAxes,
    ) -> FlowResult<Novel> {
        let _ = look;
        self.expand(intent, cfg)
    }
}

/// G0 look axes that steer the LLM-free template expansion: genre/style,
/// ratio, time-of-day, weather. The LLM expander (later) replaces these
/// axes with the provider's full context; the template keeps the flow
/// honest today.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LookAxes {
    pub genre_name: String,
    pub style: String,
    pub ratio: String,
    pub time_of_day: String,
    pub weather: String,
}

impl Default for LookAxes {
    fn default() -> Self {
        Self {
            genre_name: "Cinematic".into(),
            style: "cinematic natural light".into(),
            ratio: "16:9".into(),
            time_of_day: "midday".into(),
            weather: "clear".into(),
        }
    }
}

impl From<&crate::generation::video_flow::engine::seed::EngineEntry> for LookAxes {
    fn from(e: &crate::generation::video_flow::engine::seed::EngineEntry) -> Self {
        Self {
            genre_name: e.genre.name.clone(),
            style: e.genre.style.clone(),
            ratio: e.ratio.clone(),
            time_of_day: e.time_of_day.clone(),
            weather: e.weather.clone(),
        }
    }
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

/// Deterministic template expansion (the LLM-free `expand_with_look`):
/// fills the secondary layers (lighting / environment / motion) and the
/// ambient dynamics from G0 look axes + entry-text keywords. The primary
/// layer stays the entry text verbatim (identity-lock: the novel's main
/// narrative never drifts from what the user typed); the template adds
/// *implied* content the entry suggests but doesn't spell out — exactly
/// the secondary/ambient layers the LLM seam would produce later.
///
/// The word floor is validated on the POST-expansion total, so a short
/// idea legitimately clears it: the floor guards expansion output, which
/// is what it was designed for.
pub struct TemplateLayeredExpander;

/// Lighting layer prose per time-of-day (closed-vocabulary, deterministic).
fn lighting_layer(tod: &str, weather: &str) -> String {
    let w = if weather.trim().is_empty() || weather.eq_ignore_ascii_case("clear") {
        String::new()
    } else {
        format!(" under {weather}")
    };
    match tod {
        "dawn" => "low warm dawn light rakes across the scene with long gentle shadows".into(),
        "morning" => "soft golden morning light fills the scene with crisp clean shadows".into(),
        "evening" => "low amber evening light stretches the shadows and warms the frame".into(),
        "night" => "cool blue moonlight and scattered practicals carve quiet pools of light".into(),
        _ => format!(
            "bright natural {tod} light gives the scene clean hard-edged definition{w}"
        ),
    }
}

/// Extract up to 3 location cues from the entry text (closed keyword scan,
/// deterministic order). Used to imply environment layers without inventing
/// places the user never referenced.
fn location_cues(entry: &str) -> Vec<&'static str> {
    const CUES: [(&str, &str); 12] = [
        ("forest", "the deep forest"),
        ("meadow", "the open meadow"),
        ("city", "the city street"),
        ("street", "the city street"),
        ("river", "the nearby river"),
        ("ocean", "the ocean"),
        ("beach", "the shoreline"),
        ("desert", "the desert"),
        ("mountain", "the mountain ridge"),
        ("road", "the open road"),
        ("lake", "the lake"),
        ("field", "the wide field"),
    ];
    let lower = entry.to_lowercase();
    let mut seen_kws: Vec<&str> = Vec::new();
    let mut seen: Vec<&'static str> = Vec::new();
    for (kw, label) in CUES {
        if lower.contains(kw) && !seen_kws.iter().any(|k| *k == kw) {
            seen_kws.push(kw);
            seen.push(label);
        }
        if seen.len() >= 3 {
            break;
        }
    }
    seen
}

/// Ambient dynamics implied by the weather (the layer's independent motion).
fn weather_ambient(weather: &str) -> Option<String> {
    let w = weather.to_lowercase();
    if w.contains("rain") || w.contains("storm") {
        Some("rain streaks across the frame while gusts bend the nearby foliage".into())
    } else if w.contains("fog") || w.contains("mist") {
        Some("thin mist drifts slowly across the ground and softens distant details".into())
    } else if w.contains("snow") {
        Some("snowflakes fall on their own slow diagonal while the world mutes".into())
    } else if w.contains("wind") {
        Some("the wind moves grass and branches on their own rhythm".into())
    } else if w.is_empty() || w.contains("clear") {
        Some("leaves and grass stir gently in a light passing breeze".into())
    } else {
        None
    }
}

impl LayeredExpander for TemplateLayeredExpander {
    fn expand(&self, intent: &IntentSnapshot, cfg: &ExpandParams) -> FlowResult<Novel> {
        // No look context: behave like the passthrough (floor on entry only).
        self.expand_with_look(intent, cfg, &LookAxes::default())
    }

    fn expand_with_look(
        &self,
        intent: &IntentSnapshot,
        cfg: &ExpandParams,
        look: &LookAxes,
    ) -> FlowResult<Novel> {
        let text = normalize_text(&intent.entry_text);
        if text.is_empty() {
            return Err(FlowError::EmptyInput);
        }
        let all_spans: Vec<SpanId> = intent
            .clauses
            .iter()
            .enumerate()
            .filter_map(|(i, _)| intent.clause_span(i))
            .collect();

        // ── Secondary layers (implied content, from G0 axes) ────────────
        let mut secondary: Vec<Layer> = Vec::new();

        // Style: the G0 genre + style string becomes the global style layer.
        let style_text = if look.style.trim().is_empty() {
            look.genre_name.clone()
        } else {
            format!("{} look, {}", look.genre_name, look.style)
        };
        secondary.push(Layer {
            kind: LayerKind::Atmosphere,
            text: style_text,
            from: all_spans.clone(),
        });

        // Lighting: time-of-day + weather templated.
        let tod = look.time_of_day.clone();
        let weather_str = look.weather.clone();
        let lighting = lighting_layer(&tod, &weather_str).to_string();
        secondary.push(Layer {
            kind: LayerKind::Lighting,
            text: format!("{tod} lighting: {lighting}"),
            from: all_spans.clone(),
        });

        // Environment: location cues the entry text itself names (closed
        // keyword scan — never invents places the user didn't imply).
        for cue in location_cues(&text) {
            secondary.push(Layer {
                kind: LayerKind::Environment,
                text: format!("the scene sits within the {cue}, its textures and depth implied by the {tod} light"),
                from: all_spans.clone(),
            });
        }

        // Motion: the entry's action words steer the camera language.
        let motion_cue = if text.to_lowercase().contains("walk")
            || text.to_lowercase().contains("run")
            || text.to_lowercase().contains("move")
        {
            "the camera holds steady while the subject's motion carries the frame"
        } else {
            "a slow deliberate camera drift keeps the subject anchored in frame"
        };
        secondary.push(Layer {
            kind: LayerKind::Motion,
            text: motion_cue.to_string(),
            from: all_spans.clone(),
        });

        // ── Ambient layers (independent dynamics, from weather) ────────
        let mut ambient: Vec<Ambient> = Vec::new();
        if let Some(dynamics) = weather_ambient(&weather_str) {
            ambient.push(Ambient {
                description: format!("ambient {weather_str} air moving through the scene"),
                dynamics,
                from: all_spans.clone(),
            });
        }

        // ── The floor guards the POST-expansion narrative (primary +
        //    secondary words), not the raw entry: the expansion itself is
        //    what lifted a short idea past the minimum narrative mass. ──
        let total_words =
            word_count(&text) + secondary.iter().map(|l| word_count(&l.text)).sum::<usize>();
        if cfg.min_novel_words > 0 && total_words < cfg.min_novel_words {
            return Err(FlowError::text_output(format!(
                "expansion too small: {total_words} words < min {}",
                cfg.min_novel_words
            )));
        }
        if cfg.max_novel_chars > 0 {
            let chars = text.chars().count()
                + secondary.iter().map(|l| l.text.chars().count()).sum::<usize>();
            if chars > cfg.max_novel_chars {
                return Err(FlowError::text_output(format!(
                    "expansion too large: {chars} chars > max {}",
                    cfg.max_novel_chars
                )));
            }
        }

        Ok(Novel {
            step_version: cfg.step_version,
            primary: Layer {
                kind: LayerKind::Primary,
                text,
                from: all_spans.clone(),
            },
            secondary,
            ambient,
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
