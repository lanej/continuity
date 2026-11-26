# Project guidance

Keep Markdown paragraphs on one source line. Use Bun 1.4.5 for the TypeScript proof; do not introduce a Node runtime requirement.

The current scope is the isolated proof under `proof/`, with real Dolt and controlled adapters. Preserve canonical record identity, revision-pinned references, history, and operator-only reassessment. Keep source records authoritative and generated documents reproducible.

For code changes, run `bun run check` from `proof/` for formatting, typed lint, strict type checking, and unit tests. Changes affecting persistence, state transitions, adapters, or runtime ownership also require `bun run acceptance`, which owns its server and retains evidence. Preserve failure evidence and never claim controlled adapter results establish live tool behavior or migration readiness.

Retain Socrates decisions and historical artifacts. Downloaded tools, dependencies, and mutable runtime databases stay ignored; committed synthetic evidence documents the bounded acceptance conditions.
