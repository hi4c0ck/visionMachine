//! The append-only *preference signal* log.
//!
//! The local models are trained (manually now, on-device-continuous later) on
//! **signals** — one record per preference event. The harness *captures*
//! signals; it never trains. The separate trainer reads `flow_signals.jsonl`
//! and retrains an additive head (`learn.rs`) without touching the base.
//!
//! Signal kinds (the "what did the user do" vocabulary):
//! - `EditDiff` — the user edited a generated structure element (the diff is
//!   the signal: they moved/changed a section → the critic should have scored
//!   it differently).
//! - `Accept` / `Reject` — the user kept or discarded a whole flow run.
//! - `Rate` — the user explicitly rated the rendered output (a future head's
//!   target, when the critic moves to the rendered-video layer).
//!
//! Each record is small, stable, and wire-serializable; the log is
//! append-only (never mutated) so a trainer can replay history deterministically.

use serde::{Deserialize, Serialize};
use std::path::Path;

/// What a signal event represents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SignalKind {
    /// The user edited a generated structure element.
    EditDiff,
    /// The user accepted a whole flow run (kept the result).
    Accept,
    /// The user rejected a whole flow run.
    Reject,
    /// The user rated a rendered output (future critic target).
    Rate,
}

/// One preference-event record.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalRecord {
    /// Stable record id (a `SpanId`-style label).
    pub record_id: String,
    pub kind: SignalKind,
    /// The flow run this signal belongs to (the `flow_version` + a run id).
    pub flow_version: u32,
    /// Which element/section the signal is about (a `SpanId`-style label).
    pub target_span: String,
    /// Human/LLM-readable note (the "why").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    /// Unix-seconds capture time (0 in tests).
    #[serde(default)]
    pub ts: u64,
}

impl SignalRecord {
    /// The single source of truth for "what shape is a signal." Centralized
    /// here so the trainer and the harness never disagree on the record type.
    pub fn target(&self) -> &str {
        &self.target_span
    }
}

/// Minimal in-memory log (append-only, order-preserving). The on-disk
/// `flow_signals.jsonl` is this, one record per line.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalLog {
    pub records: Vec<SignalRecord>,
}

impl SignalLog {
    pub fn new() -> Self {
        Self::default()
    }

    /// Append a record. The log is append-only: no overwrite, no reorder.
    pub fn push(&mut self, record: SignalRecord) {
        self.records.push(record);
    }

    /// All records for one target span (the critic's training slice).
    pub fn for_span(&self, target_span: &str) -> Vec<&SignalRecord> {
        self.records
            .iter()
            .filter(|r| r.target_span == target_span)
            .collect()
    }

    /// Count records by kind (a quick signal-coverage summary).
    pub fn counts_by_kind(&self) -> std::collections::BTreeMap<SignalKind, usize> {
        let mut m: std::collections::BTreeMap<SignalKind, usize> =
            std::collections::BTreeMap::new();
        for r in &self.records {
            *m.entry(r.kind).or_insert(0) += 1;
        }
        m
    }
}

/// Serialize one record to a single-line JSON string (for the JSONL file).
pub fn signal_line(record: &SignalRecord) -> Option<String> {
    serde_json::to_string(record).ok()
}

/// Append a record to a JSONL file (create if missing). Reuses the media
/// module's `append_jsonl` helper via `serde_json::Value` — kept local here so
/// the signal module has no dependency on the media tree.
pub fn append_signal_jsonl(
    path: &Path,
    record: &SignalRecord,
) -> Result<(), std::io::Error> {
    use std::io::Write;
    use std::fs::OpenOptions;
    let line = signal_line(record)
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidData, "signal not encodable"))?;
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(file, "{line}")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(id: &str, kind: SignalKind, span: &str) -> SignalRecord {
        SignalRecord {
            record_id: id.into(),
            kind,
            flow_version: 1,
            target_span: span.into(),
            note: None,
            ts: 0,
        }
    }

    #[test]
    fn log_is_append_only_and_ordered() {
        let mut log = SignalLog::new();
        log.push(rec("1", SignalKind::Accept, "s1"));
        log.push(rec("2", SignalKind::EditDiff, "s1"));
        log.push(rec("3", SignalKind::Reject, "s2"));
        assert_eq!(log.records.len(), 3);
        assert_eq!(log.records[0].record_id, "1");
        assert_eq!(log.records[2].record_id, "3");
    }

    #[test]
    fn for_span_filters_the_training_slice() {
        let mut log = SignalLog::new();
        log.push(rec("1", SignalKind::EditDiff, "s1"));
        log.push(rec("2", SignalKind::EditDiff, "s2"));
        log.push(rec("3", SignalKind::Accept, "s1"));
        let s1: Vec<_> = log.for_span("s1").iter().map(|r| r.record_id.clone()).collect();
        assert_eq!(s1, vec!["1", "3"], "only records for s1, in order");
    }

    #[test]
    fn counts_by_kind_summary() {
        let mut log = SignalLog::new();
        log.push(rec("1", SignalKind::Accept, "s1"));
        log.push(rec("2", SignalKind::Accept, "s1"));
        log.push(rec("3", SignalKind::EditDiff, "s1"));
        let counts = log.counts_by_kind();
        assert_eq!(counts[&SignalKind::Accept], 2);
        assert_eq!(counts[&SignalKind::EditDiff], 1);
    }

    #[test]
    fn signal_line_is_single_line_json() {
        let r = rec("1", SignalKind::Accept, "s1");
        let line = signal_line(&r).unwrap();
        assert!(!line.contains('\n'), "a signal line must not contain a newline");
        let back: SignalRecord = serde_json::from_str(&line).unwrap();
        assert_eq!(back.record_id, "1");
    }
}
