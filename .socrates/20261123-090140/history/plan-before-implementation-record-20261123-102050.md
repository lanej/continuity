# Bounded Dolt work-lifecycle proof

Specification: [spec.md](spec.md), v4, evidence-v1.
Status: Draft awaiting approval.
Implementation approval: Not yet given.

## Outcome and boundaries

Build an isolated command-line proof using real Dolt and controlled Studio, Producer (Worktree Manager), and Publisher (Octo Manager) adapters. Demonstrate one durable body's reasoning and full lifecycle across sessions, including invalidation, confirmed pause, operator-only reassessment, resumption, verification, and controlled delivery. Produce an evidence-backed recommendation about the domain model and direct Dolt separately. This does not migrate Beads or modify/integrate the live tools.

All implementation and evidence live under `proof/` in this workspace. Use Bun for the harness to match Studio's existing runtime; use a small explicit SQL repository boundary and a common command/application layer rather than a network daemon. Exact driver and table layout are executor choices constrained by the specification. T1 → T2 → T3 → T4 form the sequential implementation spine because they share schema, state transitions, and the acceptance fixture. Evidence indexing, rendering from settled snapshots, and drafting the comparison can proceed alongside implementation once their inputs are stable; no additional agents are needed. Independent critique is read-only and does not authorize implementation.

## T1 — Establish the isolated runtime and storage contract

Depends on: approved plan and spec v4. Maps to: R8, R9.

Inputs: official Dolt documentation, the Bun executable already found at `/Users/joshlane/.local/bin/bun`, and an existing verified Dolt executable if available. Read-only discovery found no `dolt` on the current PATH; do not assume it is installed. If needed, obtain a version-pinned official binary with verified checksum into `proof/.tools/`; record the exact version, platform, source, and checksum. Keep downloads/build caches and the mutable proof database separate. Use only task-owned resources.

Create `proof/package.json`, its lockfile, a minimal TypeScript harness, and setup/cleanup scripts. Use a workspace-local database and, if required by the selected SQL client, a task-owned loopback Dolt server with an owned ephemeral port. Establish SQL transaction behavior and the relationship between command acceptance, durable semantic events, and Dolt history before building the lifecycle.

Output: a rerunnable setup plus a storage/history contract in `proof/README.md` and `proof/evidence/runtime.json`. Check: write a synthetic revision/event, reopen from another process, and inspect both current state and attributable Dolt history. Inject a failed/retried command at the SQL/Dolt-history boundary. Do not move on if the chosen commit strategy can report a successful durable command without recoverable, attributable history. Resolve within scope or report a concrete failed feasibility result.

## T2 — Build the smallest connected model and command boundary

Depends on: T1. Maps to: R1, R2, R4, R6, R8, R10.

Implement schema/migrations, records, and commands under `proof/schema/` and `proof/src/`. Include stable work and entity IDs; distinct session, allocation, attempt, and receipt identities; revisioned requirements, assumptions, and decisions with rationale/evidence; specification baselines; requirement-linked tasks; explicit reasoning reliance; and semantic events. Add only the operational tables required by T3/T4. Distinguish containment, task blockers, reasoning reliance, and publish dependencies.

Give requirements, assumptions, and decisions canonical identities independent of sessions and work items. Add lookup and explicit attach/reference commands, with foreign-key/reference validation and unique attachment edges. Search before creation; reuse existing IDs across sessions and work items instead of copying authoritative content. Preserve revisions under the same logical ID, and pin canonical ID/revision references in baselines and rendered documents. Keep genuinely distinct scoped records explicit and record derivation provenance when applicable; do not build semantic auto-merging or a natural-language deduplication engine.

When a new dependent use attaches an already-invalidated revision, directly or transitively, atomically establish its applicable hold before allowing any advancement. Historical-only references remain inspectable and do not imply activation. This guard applies at attachment and at transition validation, so subsequent references cannot evade the initial invalidation fan-out.

Require a command ID and expected command concurrency revision for mutations. Keep this revision distinct from immutable approved execution baseline IDs and fixture source revisions. Baselines identify the approved specification/plan and relevant requirement/decision/assumption revisions. Verification binds to the baseline/source pair, not the command revision. Persist the mutation and semantic event atomically, and implement the T1 history strategy. Replay of one command returns the recorded outcome without another effect; stale commands fail before mutation or adapter dispatch. Operator capability comes from a trusted harness entry point; the agent adapter cannot promote itself by supplying an actor field. Avoid a general plugin platform or production authentication work.

Output: commands to create/update/freeze/reopen/read the synthetic work, look up and attach canonical records, and render specification and decision/assumption Markdown with canonical IDs and source revisions. Check: session B reads session A's work ID and attaches its canonical records to a second work item without increasing logical record counts; a frozen baseline remains inspectable after reopening; duplicate/stale mutations and dangling/duplicate attachments are rejected or idempotently reused as appropriate; generated files can be recreated solely from records.

## T3 — Prove invalidation, confirmed pause, and operator-only reassessment

Depends on: T2. Maps to: R5, R8, R9, R10.

Add durable holds, transitive impact traversal, attempt state, reassessment records, and controlled pause/resume adapter behavior. A fixture links one assumption through a requirement and decision to affected tasks, with unrelated work as a control. Invalidation records the hold and pause request; adapter acknowledgement changes pause-requested to paused. Held work cannot start or accept verification/publication authorization. Unacknowledged pause stays visible and blocked.

Extend the fixture with a second work item that references the same canonical assumption, requirement, and decision. Traverse shared references to both active uses during invalidation; persist the full affected set and holds using the transaction/revision guard strategy, with no partial fan-out acceptance. Preserve pinned historical baseline references. Assert one logical record of each shared kind, separate work/attempt identities, and that operator clearance scoped to the first item's holds does not release the second.

After invalidation, attach another dependent use of the same invalidated revision and assert it receives a hold atomically. Verify that starts, verification acceptance, and publication authorization fail for that use until its own current operator reassessment. Confirm the already-cleared first work item can advance while the other uses remain held.

Require a current operator reassessment covering the actual holds and revised basis, with evidence/rationale. Preserve the invalidated assumption and previous decision history. Agent clearance, stale clearance, and clearing an older hold in place of a newer one must fail. Resume is distinct from clearance and requires confirmed pause. Preserve state across harness process restart.

Output: a deterministic invalidation scenario with traces and assertions. Check: expected transitive affected IDs, unrelated work remains runnable, pause acknowledgement cannot be fabricated by requesting it, agent/stale clearance fails, current operator clearance plus resume succeeds. These checks exercise controlled workers only.

## T4 — Complete the controlled verification and delivery handoffs

Depends on: T3. Maps to: R2, R7, R8, R9.

Add controlled Producer allocation receipts and Publisher request/receipt observations, keeping native allocation IDs and publication IDs separate from work identity. Record verification command/result against the immutable approved execution baseline and fixture source revision. Assert that storing the verification result and publication intent advances command concurrency revisions without invalidating that evidence. A relevant baseline/source change or relied-on assumption invalidation must make it inapplicable. Exercise pending, uncertain, failed, and confirmed outcomes through controlled adapters; retain uncertainty rather than interpreting it as failure or success. A retry reuses the same request identity. Current applicable verification permits publication authorization only when no applicable hold remains on the target work/use; confirmation is a separate observation.

Output: the complete sequential acceptance scenario in `proof/scenarios/` with machine-readable results. Check: reject stale verification, block held publication, preserve historical evidence, reconcile an uncertain request without duplicate dispatch, and distinguish verification success from confirmed delivery. No real GitHub, Worktree Manager, Studio, or Octo service calls occur.

## T5 — Retain evidence and assess whether to proceed

Depends on: T4 for the full acceptance assessment; any T1–T4 stopping point for required failure finalization. Maps to: R1–R10.

After successful T4, run the required scenario and targeted failures against real Dolt. At every stopping point, including failed T1 feasibility, finalize the evidence available so far, write an explicit failed/incomplete assessment, and clean up only task-owned disposable resources. Retain runtime/version/checksum data, command outcomes and event IDs, adapter trace, current-state queries, relevant Dolt commits/diffs, regenerated Markdown, and a requirement-to-evidence map under `proof/evidence/` as available. Mark unrun cases as unrun. Include an executable rerun or failure-reproduction command in `proof/README.md`. Preserve only the small synthetic database or an adequate local reproducible snapshot plus its recreation script; remove task-owned disposable downloads and stop only task-owned processes, retaining evidence needed for inspection.

Write `proof/assessment.md` separating (1) whether the first-class work model supports the confirmed requirements, (2) what direct Dolt supplied and complicated, (3) what current Beads/Studio attempt storage already supports, (4) failed/unproven cases, and (5) proceed/revise/stop with the smallest justified next step. Beads comparison is an evidence-based architectural comparison, not an unperformed head-to-head runtime benchmark. No successful controlled result authorizes live integration or migration.

Output: reviewable proof and assessment. Check: every R1–R10 criterion links to actual evidence or is explicitly failed/unproven, including shared record counts, canonical reference identity, cross-reference invalidation, and scoped hold clearance; no live-acceptance claim is inferred from a fixture. If any required case fails, report proof incomplete/failed and retain the evidence; do not weaken the acceptance contract or begin migration.

## Review and execution status

This is a proposed plan, awaiting user approval. Independent fresh-context critique reviewed spec v1 and plan draft v1; C1–C3 were incorporated into spec v2 and its plan, then rechecked with no new blocker. The user's canonical-reference requirement reopened the specification as v3. Delta critique C4/C5 led to v4's late-attachment hold rule and target-scoped publication gate; the reviewer rechecked both corrections, resolved both findings, and identified no new blocker or contradiction. The original artifacts are retained in `history/`, and [plan-critique.md](plan-critique.md) records review findings. No implementation, real Dolt test, migration, live worker pause, or publication has been performed by this planning session.
