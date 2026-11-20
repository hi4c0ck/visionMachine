# Director board hardening — batch B11–B13

Branch: `feat/director-board-hardening` (off `feat/director-c11-rerun-from-step` @ `731bf71`).
Landing rule: one commit per item, no incidental refactors, Template-A tokens only.
Gates per item: `cargo test` (B12), `npx svelte-check`, `npm run build`, `npm test` (vitest).

## B11 — untrained-critic banner (view-only, ScoreboardTab)

While `doc?.criticModel?.untrained`, the Q1 tag bars and the Learning strip render
deterministic stub scores pinned at 0.5 — the board looks alive but carries zero
signal (the "puffy promo" risk). The stub note today lives only in the Critic A/B
card, not where the numbers are.

1. Q1 card ("Weak spots" heading): one-line `<p class="hint">` under the heading
   when `doc?.criticModel?.untrained`:
   "deterministic critic — every score is neutral (0.5) until a critic head trains (Phase 2)".
2. Learning strip: fold the same fact into the existing hint line
   ("untrained (stub)" is already there — extend it to say scores are neutral),
   no new card.

## B12 — re-run provenance (Rust + TS + UI)

C11 persists a re-run as `flow.v{K+1}`, but nothing records HOW a doc was
produced — a re-run row in the runs ledger is indistinguishable from a full run.
The board can't answer "did I improve it or just re-derive it?".

Rust:
1. `FlowDocument` gains `rerun_from: Option<String>` —
   `#[serde(default, skip_serializing_if = "Option::is_none")]` so old
   `flow.v{N}.json` files load verbatim.
2. `run_full_with_entry` → `rerun_from: None`; `run_from_step` →
   `rerun_from: Some(step.name().to_string())`.
3. `FlowSummary` gains `rerun_from: Option<String>`; `director_list_flows`
   copies it from the loaded doc.
4. Tests: `run_from_step` sets the field per step; `run_full` leaves it `None`.

TS:
5. `types.ts`: `rerunFrom: string | null` on `FlowSummary` and `FlowDocument`.

UI:
6. Runs-ledger row: after the verified chip, `{#if f.rerunFrom}` → mono chip
   `↻ {f.rerunFrom}` (title: "re-run from {step} — upstream locked · S5
   re-verified · persisted as v{flowVersion}"), styled like `.run-chip`
   (accent family, Template A).

## B13 — Critic A/B version picker (view-only, ScoreboardTab)

The Critic A/B card is a dead text paragraph ("flag ≥2 golden runs across two
critic head versions to compare"). Scaffolding: the version pickers are live now;
the diff stays disabled with a note.

1. `criticVersions` = $derived: distinct `criticModelVersion` values from the
   golden baselines ∪ the current doc's version, filtered to `> 0`, sorted.
2. Two selects (head A / head B) over those versions; both default to the newest.
   With <2 distinct versions the Diff button stays disabled.
3. Diff button disabled, note: "trained critic heads land in Phase 2 — diff is
   read-only for now".
