# Continuity: Dolt work-model proof

An isolated, runnable proof of a durable reasoning and work model. It uses real Dolt, synthetic records, and controlled allocation/publication adapters to test canonical references, assumption invalidation, operator reassessment, and lifecycle evidence. It has no live application integrations. The [project overview](../README.md) explains its purpose and architecture.

## Run

Requires macOS ARM64 and Bun 1.4.5. The setup downloads the official Dolt 2.7.6 archive if needed, checks the release asset's SHA-256, and retains the extracted binary's checksum for subsequent verification. Nothing is installed globally.

```sh
cd proof
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run acceptance
```

`check` runs 120-column formatting verification, typed ESLint, strict TypeScript, and the unit tests without a Dolt server. Use `bun run format` to apply formatting. CI runs the checks and the full proof on macOS ARM64. It starts with an empty evidence directory so the artifact contains only results from that run.

`acceptance` verifies the pinned Dolt release before starting the server. It owns the server through shutdown and creates a fresh database for each run. It runs the storage gate, domain tests, TypeScript checking, and full lifecycle scenario. It stops on a failed stage, saves the available evidence, and attempts cleanup of its own server. A pre-existing server manifest causes it to refuse startup rather than take over another run. Loopback access and downloads may require the host's sandbox approval.

Evidence is retained in [evidence/](evidence/). `run-status.json` identifies each stage, its exit code, and its log. `acceptance.json` records named lifecycle checks; `requirement-evidence.json` maps them to the specification. Generated document views are under `evidence/views/`. The assessment is [assessment.md](assessment.md).

## Model and authority

Canonical requirements, assumptions, and decisions have logical IDs independent of sessions and work items. Their revisions are immutable. Work items attach existing `(ID, revision)` references, and task roots link to those canonical records. A specification baseline pins both the knowledge closure and the reviewed task definitions. Ordinary revision does not create another logical requirement, decision, or assumption.

Lookup supports ID, kind, scope, and text. Creating a record with an existing `(kind, scope, key)` fails with `existing_record`; callers should find and attach it. Similar prose is not proof of identical meaning: there is no automatic semantic deduplication or merging. The acceptance fixture explicitly performs lookup and demonstrates that two work items share three logical records without creating copies.

Invalidation traverses revision-pinned reasoning dependencies and creates holds for every affected active use. A hold retains the tasks originally affected, so editing a task cannot evade its reassessment. Later attachments inherit existing invalidations, including transitive ones. Reattaching an old invalidated revision after clearance creates a new hold. Historical references stay inspectable.

Running affected attempts become `pause-requested`; only a trusted controlled adapter acknowledgement changes them to `paused`. Only an explicit operator reassessment can clear named current holds, and the revised approved baseline must address the invalidated basis. Clearing holds does not resume work; resumption is separate. Holds on one work item do not block unrelated or separately reassessed work.

The command concurrency revision advances on accepted changes. Verification instead binds to an immutable approved execution baseline and fixture source revision. Recording evidence or publication intent does not invalidate that evidence. Changing its applicable basis/source prevents publication until current evidence is obtained. Publication dependencies are separate from the work graph.

## Persistence and interfaces

`src/model.ts` is a functional domain core. `src/store.ts` validates commands and persists changed typed records, a semantic event, and a command receipt in one SQL transaction. Dolt's `dolt_transaction_commit=1` creates history at that same commit boundary. The storage probe verifies rollback, recovery after a lost commit response, replay without duplication, case-sensitive IDs, and the introducing Dolt commit for the command receipt.

Each record family has a separate table with a binary-collated primary ID and a JSON payload. This is a bounded proof representation: referential and transition rules live in the application layer, not SQL foreign keys. Commands load the small synthetic dataset, apply validated transitions, and persist changed rows. Production indexing, normalized columns, schema evolution, and concurrency design remain later work.

Mutation input is JSON with `id`, `expectedRevision`, `operation`, and `payload`. Responses contain `commandId`, the resulting `revision`, `eventIds`, and `result`. An identical replay returns the original outcome; a different payload or authority under the same command ID fails. A stale expected revision fails without partial state or adapter dispatch. A task-owned writer lock refuses concurrent or uninspected interrupted writers rather than stealing their lock.

Supported operations are `work.create`, `session.attach`, `knowledge.create`, `knowledge.revise`, `knowledge.attach`, `task.plan`, `baseline.approve`, `baseline.reopen`, `source.update`, `assumption.invalidate`, `attempt.start`, `attempt.pause-ack`, `hold.reassess`, `attempt.resume`, `verification.record`, `effect.request`, and `effect.observe`. Read commands provide snapshot, lookup, and document rendering.

```sh
# For inspection, leave this foreground launcher running in a separate terminal.
bun run start

# From another terminal in proof/:
bun run proof
bun run cli snapshot
bun run cli lookup '{"kind":"assumption"}'
bun run cli render WORK_ID
printf '%s\n' '{"id":"inspection-session","expectedRevision":CURRENT_REVISION,"operation":"session.attach","payload":{"id":"inspection","workId":"WORK_ID"}}' | bun run cli command

# When finished, stop only the server identified by this proof's manifest.
bun run stop
```

`proof` initializes the fresh database and populates the controlled scenario. The JSON example is a template: replace `CURRENT_REVISION` and `WORK_ID` with values from the snapshot. `src/operator.ts command` represents the trusted operator entry point in this controlled harness. Ordinary agent input cannot choose its authority through a JSON field. This demonstrates role separation inside the harness, not authentication against a caller with shell or database access.

`ControlledAdapters` uses a separate fsynced fixture ledger to model effects outside the database transaction. Requests have stable effect IDs. A simulated lost response leaves a real fixture entry; reconciliation finds that entry without dispatching another effect. New publication dispatch revalidates current verification, so an earlier accepted intent cannot bypass a later invalidation or source change. All receipt targets use `fixture://`; they are not live publications or allocations.

## Resources and limits

The checked runtime lives under `.tools/`; mutable databases, logs, fixture ledgers, and ownership metadata live under `.runtime/`. The Unix socket uses a short `/tmp/wp-TOKEN.sock` path to fit macOS socket limits. Startup and shutdown verify task ownership; no existing service, global configuration, or production credentials are required. Generated evidence is kept separately from disposable downloads and logs.

A successful run proves only the recorded single-writer, synthetic scenarios. It does not prove live worker interruption, actual checkout lifecycle, GitHub publication, production authentication, multi-host/offline synchronization, power-loss recovery, remote backup/restore, or production-scale performance. A stale writer lock is deliberately retained for inspection; this proof does not promise automatic crash takeover.

Official runtime references: [Dolt 2.7.6 release](https://github.com/dolthub/dolt/releases/tag/v2.7.6), [Dolt transaction history setting](https://www.dolthub.com/docs/sql-reference/server/configuration/#dolt_transaction_commit), and [Bun SQL](https://bun.sh/docs/runtime/sql).
