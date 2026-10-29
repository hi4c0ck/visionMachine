//! Concrete, version-aware errors for the video-flow harness.
//!
//! The flow fails fast with a *real, named* error (the D1 discipline: no
//! simulated success). Each variant names the failing step + the offending
//! value, so a UI or test can surface exactly what broke instead of a generic
//! "error".

use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FlowError {
    /// The raw entry text was empty after normalization.
    EmptyInput,
    /// A text-output invariant failed (expansion too small, malformed marker,
    /// unknown tag, empty section prompt, …). Carries a human-readable detail.
    TextOutput(String),
    /// The narrative could not be turned into a structured plan.
    Structure(String),
    /// The structured plan could not be lowered into flow elements.
    Materialize(String),
    /// A marker used a tag keyword the flow does not define.
    UnknownTag(String),
    /// A structural limit was exceeded (too many sections / tags).
    Overflow(String),
    /// A step that needs an LLM was reached with no expander wired yet.
    LlmNotConfigured,
    /// The local critic produced an inconsistent score tree.
    Critic(String),
    /// The lowering step (structured → flow elements) failed an invariant.
    Lower(String),
    /// A local model build / resolution problem (tiny build spec).
    Model(String),
    /// A provenance link is broken (an element claims a span that no layer
    /// or intent clause produced).
    Provenance(String),
    /// The append-only signal log was malformed or rejected an event.
    Signal(String),
}

impl FlowError {
    /// Convenience constructor for the most common text-output failure.
    pub fn text_output(msg: impl Into<String>) -> Self {
        Self::TextOutput(msg.into())
    }
    /// Convenience constructor for the lowering step.
    pub fn lower(msg: impl Into<String>) -> Self {
        Self::Lower(msg.into())
    }
}

impl fmt::Display for FlowError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyInput => write!(f, "empty input"),
            Self::TextOutput(d) => write!(f, "text output: {d}"),
            Self::Structure(d) => write!(f, "structure: {d}"),
            Self::Materialize(d) => write!(f, "materialize: {d}"),
            Self::UnknownTag(t) => write!(f, "unknown tag '{t}'"),
            Self::Overflow(d) => write!(f, "limit overflow: {d}"),
            Self::LlmNotConfigured => write!(f, "LLM expander not configured"),
            Self::Critic(d) => write!(f, "critic: {d}"),
            Self::Lower(d) => write!(f, "lower: {d}"),
            Self::Model(d) => write!(f, "model: {d}"),
            Self::Provenance(d) => write!(f, "provenance: {d}"),
            Self::Signal(d) => write!(f, "signal: {d}"),
        }
    }
}

impl std::error::Error for FlowError {}

pub type FlowResult<T> = Result<T, FlowError>;
