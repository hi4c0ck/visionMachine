//! Mutation steps. Each is a typed, versioned transformation with a pluggable
//! strategy so the LLM/expander can land behind the same seam later without
//! re-architecting the pipeline.

mod expand;
mod materialize;
mod structure;

pub use expand::{
    expand_raw_text, normalize_text, validate_novel, word_count, ExpandResult,
    PassthroughExpander, TextExpander,
};
pub use materialize::materialize_pipes;
pub use structure::{
    structure_plan, validate_plan, MarkerStructurer, StructureResult, TextStructurer,
};
