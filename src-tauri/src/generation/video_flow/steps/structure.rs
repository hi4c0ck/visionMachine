//! Step 2 (structure): expanded narrative → `StructuredVideoPlan`.
//!
//! `MarkerStructurer` is the deterministic default: it reads a tiny, stable
//! marker grammar straight out of the narrative text, so the flow is fully
//! exercisable before the LLM structurer (the same grammar, LLM-fed) lands.
//!
//! Marker grammar (each token may start on its own line or after a newline in
//! the narrative; everything else is treated as the *current section's prompt*):
//!
//!   `# <title>`            → sets the pipe title
//!   `@@ <style>`          → sets the global style for the pipe
//!   `@<keyword>`           → opens a section; keyword ∈ the `VideoTag` vocabulary
//!   `@<keyword>:<s>-<e>`   → opens a section with an explicit frame range
//!
//! Lines / text after a section opener (up to the next opener) accumulate as
//! that section's prompt. Any `@keyword` not in the vocabulary is a concrete
//! `UnknownTag` error; structural caps are concrete `Overflow` errors.

use crate::generation::video_flow::config::StructureParams;
use crate::generation::video_flow::error::{FlowError, FlowResult};
use crate::generation::video_flow::plan::{PlanPipe, PlanSection, StructuredVideoPlan, VideoTag};
use serde::{Deserialize, Serialize};

/// The versioned output of step 2.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructureResult {
    pub step_version: u32,
    pub plan: StructuredVideoPlan,
}

/// Strategy seam: narrative → structured plan.
pub trait TextStructurer: Send + Sync {
    fn structure(&self, novel: &str, cfg: &StructureParams, flow_version: u32) -> FlowResult<StructuredVideoPlan>;
}

/// Parse one marker line. Returns the marker kind + its payload.
enum Marker {
    Title(String),
    Style(String),
    /// (keyword, start, end, inline) — start/end of 0 = "unset"; `inline` is
    /// the prompt text written on the marker line itself (may be empty).
    Section(String, Option<u32>, Option<u32>, String),
}

/// Classify a normalized line into a marker. A line is a marker only when it
/// begins with `#` / `@@` / `@`; anything else is prompt text for the current
/// section. For `@` markers the first whitespace token is the keyword (which
/// may carry an optional `:<start>-<end>` range); any remaining text on the
/// same line is captured as the section's *inline* prompt so nothing is lost.
fn classify(line: &str) -> Option<Marker> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    if let Some(rest) = line.strip_prefix("@@") {
        return Some(Marker::Style(rest.trim().to_string()));
    }
    if let Some(rest) = line.strip_prefix('@') {
        // First whitespace-delimited token = keyword (possibly with a
        // `:start-end` range); the remainder of the line = inline prompt.
        // `split_once` (not `split().nth(1)`) so the WHOLE remainder is kept.
        let (token, inline) = match rest.split_once(char::is_whitespace) {
            Some((t, r)) => (t, r.trim().to_string()),
            None => (rest, String::new()),
        };
        let (keyword, lo, hi) = split_keyword_range(token);
        return Some(Marker::Section(keyword, lo, hi, inline));
    }
    if let Some(rest) = line.strip_prefix('#') {
        return Some(Marker::Title(rest.trim().to_string()));
    }
    None
}

/// Split `keyword` from an optional `:start-end` range. Numbers parse as
/// `u32`; a malformed range is reported as `None` and the caller decides.
fn split_keyword_range(s: &str) -> (String, Option<u32>, Option<u32>) {
    if let Some((kw, range)) = s.split_once(':') {
        let range = range.trim();
        let (lo, hi) = match range.split_once('-') {
            Some((a, b)) => (a.trim().parse::<u32>().ok(), b.trim().parse::<u32>().ok()),
            _ => (None, None),
        };
        (kw.trim().to_string(), lo, hi)
    } else {
        (s.trim().to_string(), None, None)
    }
}

/// Convert an optional `[start, end]` marker range into concrete frames.
/// `None` frames fall back to the config default; a range with a missing end
/// defaults the end to `start + default`. Frame ranges must satisfy `end > start`.
fn resolve_frames(
    start: Option<u32>,
    end: Option<u32>,
    cfg: &StructureParams,
) -> FlowResult<(u32, u32)> {
    let default = cfg.default_section_frames;
    let s = start.unwrap_or(0);
    let e = match end {
        Some(e) => e,
        None => s.saturating_add(default),
    };
    if e <= s {
        return Err(FlowError::text_output(format!(
            "section frame range end ({e}) must be greater than start ({s})"
        )));
    }
    Ok((s, e))
}

impl MarkerStructurer {
    pub fn new() -> Self {
        Self
    }
}

pub struct MarkerStructurer;

impl Default for MarkerStructurer {
    fn default() -> Self {
        Self::new()
    }
}

impl TextStructurer for MarkerStructurer {
    fn structure(
        &self,
        novel: &str,
        cfg: &StructureParams,
        flow_version: u32,
    ) -> FlowResult<StructuredVideoPlan> {
        structure_plan(novel, cfg, flow_version)
    }
}

/// The pure core of the structurer (exposed so tests and the pipeline can call
/// it directly without going through the trait).
///
/// Parsing is LINE-ORIENTED (the marker grammar lives at the start of a line),
/// so newlines are significant here and must be preserved — the shared
/// `normalize_text` collapse is intentionally NOT used. Each line is only
/// internally trimmed.
pub fn structure_plan(novel: &str, cfg: &StructureParams, flow_version: u32) -> FlowResult<StructuredVideoPlan> {
    if novel.trim().is_empty() {
        return Err(FlowError::TextOutput("nothing to structure".into()));
    }

    let mut title = String::new();
    let mut global_style = String::new();
    let mut sections: Vec<PlanSection> = Vec::new();
    let mut current: Option<(VideoTag, u32, u32, Vec<String>)> = None; // (tag, start, end, prompt lines)

    fn flush(
        current: &mut Option<(VideoTag, u32, u32, Vec<String>)>,
        sections: &mut Vec<PlanSection>,
        cfg: &StructureParams,
    ) -> FlowResult<()> {
        if let Some((tag, s, e, lines)) = current.take() {
            let prompt = lines.join(" ");
            if prompt.trim().is_empty() {
                return Err(FlowError::text_output(format!(
                    "section '{}' has an empty prompt",
                    tag.keyword()
                )));
            }
            if sections.len() >= cfg.max_sections_per_pipe {
                return Err(FlowError::Overflow(format!(
                    "too many sections: max {}",
                    cfg.max_sections_per_pipe
                )));
            }
            sections.push(PlanSection {
                tag,
                frame_start: s,
                frame_end: e,
                prompt,
                from: Vec::new(),
            });
        }
        Ok(())
    }

    for raw_line in novel.split('\n') {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        match classify(line) {
            Some(Marker::Title(t)) => {
                flush(&mut current, &mut sections, cfg)?;
                title = t;
            }
            Some(Marker::Style(s)) => {
                flush(&mut current, &mut sections, cfg)?;
                global_style = s;
            }
            Some(Marker::Section(keyword, s, e, inline)) => {
                flush(&mut current, &mut sections, cfg)?;
                let tag =
                    VideoTag::from_keyword(&keyword).ok_or_else(|| FlowError::UnknownTag(keyword.clone()))?;
                let (fs, fe) = resolve_frames(s, e, cfg)?;
                // Seed the section's prompt lines with the marker's inline text
                // (when any) so `@camera wide shot` keeps "wide shot".
                let mut lines = Vec::new();
                if !inline.is_empty() {
                    lines.push(inline);
                }
                current = Some((tag, fs, fe, lines));
            }
            None => {
                // Prompt text belongs to the open section (a marker before any
                // section is just a prelude and is ignored).
                if let Some((_, _, _, lines)) = current.as_mut() {
                    lines.push(line.to_string());
                }
            }
        }
    }
    flush(&mut current, &mut sections, cfg)?;

    if sections.is_empty() {
        return Err(FlowError::Structure("no tagged sections found in the narrative".into()));
    }

    let pipe = PlanPipe {
        index: 0,
        title,
        global_style,
        media_mode: "text".into(),
        sections,
        // The marker-bridge plan is a sparse @tag-per-clause text, not a
        // concrete per-shot plan: leave the explicit length unset so
        // materialize falls back to the default floor (no dead tail is
        // meaningful here — the sections tile the default pipe range).
        length_frames: 0,
    };

    Ok(StructuredVideoPlan {
        flow_version,
        pipes: vec![pipe],
    })
}

/// Independent post-structure validation — the "careful text-output" guarantee.
/// The structurer is self-validating; this re-checks the produced plan against
/// the caps + per-section sanity so a hand-built plan or a future structurer is
/// also covered.
pub fn validate_plan(plan: &StructuredVideoPlan, cfg: &StructureParams) -> FlowResult<()> {
    for pipe in &plan.pipes {
        if pipe.sections.len() > cfg.max_sections_per_pipe {
            return Err(FlowError::Overflow(format!(
                "pipe {} has {} sections > max {}",
                pipe.index,
                pipe.sections.len(),
                cfg.max_sections_per_pipe
            )));
        }
        for s in &pipe.sections {
            if s.frame_end <= s.frame_start {
                return Err(FlowError::text_output(format!(
                    "section '{}' frame range invalid: {}..{}",
                    s.tag.keyword(),
                    s.frame_start,
                    s.frame_end
                )));
            }
            if s.prompt.trim().is_empty() {
                return Err(FlowError::text_output(format!(
                    "section '{}' prompt is empty",
                    s.tag.keyword()
                )));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::video_flow::config::FlowConfig;

    fn cfg() -> StructureParams {
        StructureParams::default()
    }

    /// A small narrative exercising title, style, two sections, and prompts.
    const NARRATIVE: &str = "# A fox at dusk\n@@ cinematic, warm golden hour\n\
        @camera:0-24\nwide tracking shot across the meadow\n\
        a red fox darts forward\n\
        @lighting\nsunset, long shadows\n\
        the river glints in the fading sun";

    #[test]
    fn structures_title_style_and_sections() {
        let plan = structure_plan(NARRATIVE, &cfg(), 1).unwrap();
        let pipe = plan.primary();
        assert_eq!(pipe.title, "A fox at dusk");
        assert_eq!(pipe.global_style, "cinematic, warm golden hour");
        assert_eq!(pipe.sections.len(), 2);

        let cam = &pipe.sections[0];
        assert_eq!(cam.tag, VideoTag::Camera);
        assert_eq!((cam.frame_start, cam.frame_end), (0, 24));
        assert_eq!(cam.prompt, "wide tracking shot across the meadow a red fox darts forward");

        let light = &pipe.sections[1];
        assert_eq!(light.tag, VideoTag::Lighting);
        assert!(light.frame_end > light.frame_start, "implicit range defaults");
        assert_eq!(light.prompt, "sunset, long shadows the river glints in the fading sun");
    }

    #[test]
    fn inline_prompt_on_marker_line_is_kept() {
        let plan = structure_plan("@camera:0-24 wide tracking shot", &cfg(), 1).unwrap();
        let s = &plan.primary().sections[0];
        assert_eq!((s.frame_start, s.frame_end), (0, 24));
        assert_eq!(s.prompt, "wide tracking shot", "inline marker text becomes the prompt");
    }

    #[test]
    fn unknown_tag_is_named() {
        let s = "@explosion bang";
        let err = structure_plan(s, &cfg(), 1).unwrap_err();
        assert_eq!(err, FlowError::UnknownTag("explosion".into()));
    }

    #[test]
    fn empty_section_prompt_fails() {
        let s = "@scene \n@lighting dusk";
        let err = structure_plan(s, &cfg(), 1).unwrap_err();
        assert!(matches!(err, FlowError::TextOutput(ref m) if m.contains("empty prompt")));
    }

    #[test]
    fn no_sections_fails_structure() {
        let err = structure_plan("# just a title with no tags", &cfg(), 1).unwrap_err();
        assert!(matches!(err, FlowError::Structure(ref m) if m.contains("no tagged sections")));
    }

    #[test]
    fn overflow_cap_is_named() {
        let mut c = cfg();
        c.max_sections_per_pipe = 1;
        let s = "@scene a\n@camera b";
        let err = structure_plan(s, &c, 1).unwrap_err();
        assert!(matches!(err, FlowError::Overflow(_)));
    }

    #[test]
    fn implicit_default_range_uses_config() {
        let mut c = cfg();
        c.default_section_frames = 48;
        let plan = structure_plan("@camera wide shot\n", &c, 1).unwrap();
        let s = &plan.primary().sections[0];
        assert_eq!((s.frame_start, s.frame_end), (0, 48));
    }

    #[test]
    fn validate_plan_rejects_bad_range() {
        let plan = StructuredVideoPlan {
            flow_version: 1,
            pipes: vec![PlanPipe {
                index: 0,
                title: String::new(),
                global_style: String::new(),
                media_mode: "text".into(),
                sections: vec![PlanSection {
                    tag: VideoTag::Scene,
                    frame_start: 10,
                    frame_end: 10,
                    prompt: "x".into(),
                    from: Vec::new(),
                }],
                length_frames: 0,
            }],
        };
        assert!(validate_plan(&plan, &cfg()).is_err());
        // And a good plan passes.
        let good = structure_plan("@camera wide shot\n", &cfg(), 1).unwrap();
        assert!(validate_plan(&good, &cfg()).is_ok());
    }

    #[test]
    fn structurer_trait_is_pure_and_stable() {
        let m = MarkerStructurer::new();
        let a = m.structure(NARRATIVE, &cfg(), 1).unwrap();
        let b = m.structure(NARRATIVE, &cfg(), 1).unwrap();
        assert_eq!(a, b, "structuring is deterministic");
        let _ = FlowConfig::default_flow(); // sanity: config wiring is intact
    }
}
