# Dolt proof assessment

Recommendation: proceed to a separately scoped live integration slice. The bounded proof supports a workflow-owned model and found no blocker to using direct Dolt for its tested single-writer persistence path. It does not select a production database architecture or authorize migration.

## Observed results

The self-contained acceptance run uses Bun 1.4.5 and checksum-verified Dolt 2.7.6. The real-database storage gate, six domain regression tests, strict TypeScript checking, and all 15 lifecycle acceptance groups passed. The owned server was stopped after the run. Inspect [run status](evidence/run-status.json), [storage gate](evidence/storage-gate.json), [lifecycle results](evidence/acceptance.json), and the stage logs for exact outcomes; these files are refreshed by each run.

The model recovered work and holds from a fresh process, reused the same canonical requirements/assumptions/decisions across work items, and preserved logical identity through revision. It propagated invalidation through shared references, held later-dependent attachments, distinguished requested from acknowledged pause, and required scoped operator reassessment before resumption. It preserved verification applicability across bookkeeping changes while rejecting stale basis/source evidence for publication. Controlled publication recovered from a lost response without duplicating the fixture effect.

## Domain-model fit

The useful capability is the connected model and its policies: canonical knowledge, revision-pinned reasoning dependencies, cross-work impact, holds, baselines, operator decisions, execution evidence, and effect observations. These relationships are explicit and inspectable, rather than reconstructed from issue descriptions or transcripts. Regenerating Markdown from records established that documents can be views of the same authority. The proof's reuse variant is evidence against fragmenting the work graph through per-session copies.

This does not establish that Beads cannot represent or be extended to support those concepts. It establishes that a small owned model can express the confirmed requirements coherently without adopting an issue lifecycle as their primary abstraction.

## What Dolt supplied and complicated

Dolt supplied actual SQL transactions and inspectable history. With `dolt_transaction_commit=1`, an accepted mutation, its semantic event, and its command receipt acquired history through the transaction boundary. The storage gate verified failure rollback and recovery after a lost commit response; the lifecycle run checked an introducing Dolt commit for every accepted proof command. Semantic actor/rationale/evidence remained explicit application records because generated database commit messages do not explain business decisions.

The Bun native MySQL client worked with this version pair. A long workspace path exceeded macOS's Unix-socket path limit, so the task-owned socket uses a short temporary path. This execution host required an active launcher to keep the server alive. Both are handled in the retained runtime scripts. Version/checksum management and explicit process ownership are additional operating responsibilities compared with Studio's local SQLite attempt store.

The proof uses typed JSON records in separate tables, validates relationships in the domain layer, and loads the small dataset per command. This is sufficient evidence for the selected scenarios but does not establish production relational constraints, indexing, query ergonomics, schema upgrades, or throughput. Alternative-plan branching was not required and was not evaluated as a user workflow.

## Comparison with the current workflow

The inspected [Studio README](https://github.com/lanej/studio/blob/327fae2ecb1db5af1a123972a1d9b893a6d24e28/README.md) describes Beads task ownership, revision-guarded plan approval creating child beads, local verification, and Octo publication handoffs. [Studio attempt storage](https://github.com/lanej/studio/blob/327fae2ecb1db5af1a123972a1d9b893a6d24e28/attempts.ts) already stores structured specifications and their history in SQLite; [the Socrates schema](https://github.com/lanej/studio/blob/327fae2ecb1db5af1a123972a1d9b893a6d24e28/socrates/spec.ts) already has requirements, decision IDs, evidence, dispositions, and supersession. The current workflow therefore already provides meaningful decomposition and decision support.

Upstream [Beads documentation](https://github.com/gastownhall/beads/blob/main/README.md) also advertises dependency graphs, hierarchy, readiness, audit trails, knowledge links, and Dolt storage. This proof's advantage is common authority and policies across canonical knowledge and the full lifecycle, not a claim that Beads lacks graphs or persistent memory. The comparison is architectural inspection, not a head-to-head runtime benchmark of the pinned Beads service.

Producer and Publisher remain effect boundaries in the proposed architecture. The proof preserves distinct work, session, allocation, attempt, and receipt identities. The user's chosen boundary remains: Publisher knows publish dependencies and does not own the work graph. No existing Octo issue-orchestration capability was changed or treated as the authority for this proof.

## Limits and next step

Controlled adapters are not evidence of live Studio operation, actual Worktree Manager allocation/removal, worker interruption, or GitHub/Octo publication. A separate operator entry point is not production authentication. Multi-writer/multi-host concurrency, power-loss recovery, remote restoration, operational scale, and production migration remain untested. No production data or existing tool repository was modified.

The smallest next integration slice is an explicit opt-in Studio path that creates/resumes one body of work against this model and presents canonical lookup/reference reuse during Socrates. Its acceptance should use real session boundaries and retain the same IDs across restart, then prove one real pause/reassessment handoff. Treat that as a new specification rather than interpreting this controlled result as migration approval. Producer and Publisher live effects can follow only after their actual authorization and recovery contracts are tested.

For R3, this assessment is the comparison and recommendation artifact. Other requirements map to named checks in [requirement-evidence.json](evidence/requirement-evidence.json), with state, commands, history, generated views, and fixture receipts retained alongside them.
