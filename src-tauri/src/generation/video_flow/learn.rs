//! The *tiny build specification* + resolver seam for the local models.
//!
//! This is the "keep our tiny build specification so it could be some to
//! cover only local weights or additionability" piece (fork B, locked). The
//! harness stays a **thin consumer** of trained weights — the *separate*
//! trainer (manual now, on-device-continuous later) is what produces them.
//!
//! Build shapes:
//! - `LocalWeightsOnly` — ship a base model, no heads. The simplest artifact.
//! - `Additive { base, heads }` — a base + one or more *additive* heads
//!   (LoRA/adapter-style): a new signal retrains one head without touching
//!   the base. The base is shared; heads stack on it.
//!
//! The `ModelResolver` seam is what "points to" a model: given a role +
//! version, it returns an *opaque handle* (path + build spec). The harness
//! never loads/trains here — that's the trainer's job. `StubModelResolver`
//! returns an untrained handle so the pipeline is fully testable today.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// The role a local model serves in the flow. (Only the critic + structurer
/// are local for now; expand uses the provider LLM, not a local build.)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelRole {
    Critic,
    Structurer,
}

/// An additive head: a small adapter stacked on a shared base.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdditiveHead {
    pub name: String,
    /// The signal-set (or version range) this head was trained on.
    pub trained_on: Option<String>,
}

/// The *tiny* build specification: what a local model artifact is, without
/// the trainer's internals. Small on purpose — it names the base and the
/// additive heads, nothing more.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelBuildSpec {
    pub model_version: u32,
    pub role: ModelRole,
    /// The base weights (a path relative to the model root).
    pub base: ModelBase,
    /// Additive heads stacked on `base` (empty = `LocalWeightsOnly`).
    #[serde(default)]
    pub heads: Vec<AdditiveHead>,
}

/// The base weights of a build.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelBase {
    /// A single local-weights file (the "cover only local weights" case).
    LocalWeightsOnly {
        file: String,
    },
    /// A base that additive heads stack onto.
    Additive {
        file: String,
    },
}

impl ModelBuildSpec {
    /// A `LocalWeightsOnly` build (no heads) — the minimal artifact.
    pub fn local_only(role: ModelRole, version: u32, file: &str) -> Self {
        Self {
            model_version: version,
            role,
            base: ModelBase::LocalWeightsOnly {
                file: file.to_string(),
            },
            heads: Vec::new(),
        }
    }

    /// An additive build: base + heads.
    pub fn additive(role: ModelRole, version: u32, file: &str, heads: Vec<AdditiveHead>) -> Self {
        Self {
            model_version: version,
            role,
            base: ModelBase::Additive {
                file: file.to_string(),
            },
            heads,
        }
    }

    pub fn is_additive(&self) -> bool {
        matches!(self.base, ModelBase::Additive { .. })
    }
}

/// An opaque handle to a *resolved* model (the harness's view of "the model
/// that will run"). It carries the build spec + the absolute base path so a
/// later runtime can load it; the harness itself stays weight-free.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelHandle {
    pub spec: ModelBuildSpec,
    /// Absolute path to the base weights file.
    pub base_path: PathBuf,
    /// When true, the resolver found no trained weights (the stub case) and
    /// the flow must fall back to the deterministic critic/structurer.
    #[serde(default)]
    pub untrained: bool,
}

/// Strategy seam: "point to" a model build. A real resolver reads
/// `<model_root>/<role>/v{version}/` from user-space; the stub returns an
/// untrained handle so tests need no weights.
pub trait ModelResolver: Send + Sync {
    fn resolve(
        &self,
        role: ModelRole,
        version: u32,
        model_root: Option<&str>,
    ) -> ModelHandle;
}

/// The default resolver: build the *spec* (so the artifact shape is pinned)
/// but mark it `untrained` — there are no weights on disk in Phase 0.
pub struct StubModelResolver;

impl ModelResolver for StubModelResolver {
    fn resolve(&self, role: ModelRole, version: u32, model_root: Option<&str>) -> ModelHandle {
        let base_file = format!("{role}-base");
        let root = model_root.unwrap_or("models");
        ModelHandle {
            spec: ModelBuildSpec::local_only(role, version, &base_file),
            base_path: PathBuf::from(root).join(role.to_string()).join(base_file),
            untrained: true,
        }
    }
}

impl std::fmt::Display for ModelRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Critic => write!(f, "critic"),
            Self::Structurer => write!(f, "structurer"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_only_build_has_no_heads() {
        let spec = ModelBuildSpec::local_only(ModelRole::Critic, 3, "critic-base");
        assert_eq!(spec.model_version, 3);
        assert!(!spec.is_additive());
        assert!(spec.heads.is_empty());
    }

    #[test]
    fn additive_build_stacks_heads_on_a_base() {
        let spec = ModelBuildSpec::additive(
            ModelRole::Critic,
            5,
            "critic-base",
            vec![
                AdditiveHead {
                    name: "atmosphere".into(),
                    trained_on: Some("signals/flow_signals.jsonl@v5".into()),
                },
                AdditiveHead {
                    name: "transitions".into(),
                    trained_on: None,
                },
            ],
        );
        assert!(spec.is_additive());
        assert_eq!(spec.heads.len(), 2);
        assert_eq!(spec.heads[0].name, "atmosphere");
    }

    #[test]
    fn stub_resolver_is_weight_free() {
        let h = StubModelResolver.resolve(ModelRole::Critic, 1, Some("models".into()));
        assert!(h.untrained, "Phase-0 stub has no trained weights");
        assert_eq!(h.spec.model_version, 1);
    }

    #[test]
    fn build_spec_is_wire_round_trippable() {
        let spec = ModelBuildSpec::additive(
            ModelRole::Structurer,
            2,
            "s-base",
            vec![AdditiveHead {
                name: "x".into(),
                trained_on: None,
            }],
        );
        let json = serde_json::to_value(&spec).unwrap();
        let back: ModelBuildSpec = serde_json::from_value(json).unwrap();
        assert!(back.is_additive());
        assert_eq!(back.heads.len(), 1);
    }
}
