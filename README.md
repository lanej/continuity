# Continuity

The reasoning and reassessment system behind Studio, Producer, and Publisher.

A durable model for requirements, assumptions, decisions, work breakdown, execution, verification, and delivery across Studio, Producer (Worktree Manager), and Publisher (Octo Manager).

Canonical records are referenced across sessions and work items rather than copied. Assumption invalidation identifies affected work and places it on hold until an explicit operator reassessment. Documents are generated views of the shared records.

The current implementation is a bounded proof using real Dolt with controlled tool adapters. Start with the [proof instructions](proof/README.md), [assessment](proof/assessment.md), and [retained acceptance results](proof/evidence/run-status.json).

## Run the proof

Requires macOS ARM64, Bun 1.4.5, and network access for the first dependency/runtime download. Dolt 2.7.6 is installed only in the workspace and verified against its release checksum.

```sh
cd proof
bun install --frozen-lockfile --ignore-scripts
bun run acceptance
```

The runner starts a fresh isolated Dolt database, runs the storage gate, domain regression tests, TypeScript checks, and lifecycle scenarios, retains evidence, and stops its own server.

## Design and evidence

- [Socrates specification](.socrates/20261123-090140/spec.md): agreed requirements and authority boundaries.
- [Implementation plan](.socrates/20261123-090140/plan.md) and [independent critique](.socrates/20261123-090140/plan-critique.md).
- [Execution record](.socrates/20261123-090140/execution.md) and [requirement evidence](proof/evidence/requirement-evidence.json).

Live tool integration, production authentication, distributed operation, disaster recovery, and Beads migration are not established by the controlled proof.
