import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { root } from "./runtime.ts";
import { Store } from "../src/store.ts";
const store = await Store.connect();
try {
  await store.migrate();
  const before = await store.snapshot();
  assert.equal(before.revision, 0, "Use a fresh proof database for the gate");
  const command = {
    id: "gate:write",
    expectedRevision: 0,
    operation: "work.create",
    payload: { id: "gate-work", title: "Storage gate", sourceRevision: "fixture:0" },
  };
  await assert.rejects(store.execute(command, "agent", "before-commit"), /Injected failure/);
  assert.equal((await store.snapshot()).revision, 0);
  await assert.rejects(store.execute(command, "agent", "after-commit"), /lost response/);
  const after = await store.snapshot();
  assert.equal(after.revision, 1);
  assert.ok(after.commands[command.id]);
  assert.equal(Object.keys(after.events).length, 1);
  const replay = await store.execute(command);
  assert.equal(replay.revision, 1);
  assert.equal((await store.snapshot()).revision, 1);
  await store.execute({
    id: "gate:Write",
    expectedRevision: 1,
    operation: "work.create",
    payload: { id: "gate-Work", title: "Case-distinct identity", sourceRevision: "fixture:0" },
  });
  const caseState = await store.snapshot();
  assert.ok(caseState.works["gate-work"]);
  assert.ok(caseState.works["gate-Work"]);
  assert.ok(caseState.commands["gate:write"]);
  assert.ok(caseState.commands["gate:Write"]);
  const history = await store.history();
  const evidence =
    await store.sql`SELECT to_commit, diff_type, to_id FROM dolt_diff_commands WHERE to_id = 'gate:write' AND diff_type = 'added'`;
  assert.equal(evidence.length, 1, "One introducing Dolt commit for command receipt");
  await writeFile(
    resolve(root, "evidence/storage-gate.json"),
    JSON.stringify(
      {
        passed: true,
        settings: "dolt_transaction_commit=1",
        rejectedBeforeCommit: true,
        recoveredLostResponse: true,
        caseSensitiveIdentities: true,
        idempotentReplay: replay,
        semanticEventCountAtReplay: Object.keys(after.events).length,
        receiptHistory: evidence,
        commits: history,
      },
      null,
      2,
    ),
  );
  console.log("PASS storage gate: rollback, committed history, lost-response replay");
} finally {
  await store.close();
}
