import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { root } from "../scripts/runtime.ts";
import { Store, exportTables } from "../src/store.ts";
import { ControlledAdapters } from "../src/adapters.ts";
import {
  DomainError,
  findKnowledge,
  refKey,
  renderWork,
  verificationApplicable,
  type Ref,
  type Authority,
  type State,
} from "../src/model.ts";
type Check = {
  name: string;
  requirements: string[];
  outcome: "passed";
  evidence: unknown;
};
const checks: Check[] = [];
const trace: unknown[] = [];
const runId = `run-${crypto.randomUUID().slice(0, 8)}`;
const key = (name: string) => `${runId}:${name}`;
const output = resolve(root, "evidence");

function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected persisted scenario record");
  return value;
}
let sequence = 0;
let store: Store;
let adapters: ControlledAdapters;
function check(name: string, requirements: string[], evidence: unknown = true) {
  checks.push({ name, requirements, outcome: "passed", evidence });
  console.log(`PASS ${name}`);
}
async function send(operation: string, payload: Record<string, unknown>, authority: Authority = "agent") {
  const command = {
    id: key(`command-${++sequence}`),
    expectedRevision: (await store.snapshot()).revision,
    operation,
    payload,
  };
  const result = await store.execute(command, authority);
  trace.push({ command, authority, outcome: result });
  return result;
}
async function reject(
  code: string,
  operation: string,
  payload: Record<string, unknown>,
  authority: Authority = "agent",
  expectedRevision?: number,
) {
  const before = await store.snapshot();
  const command = {
    id: key(`rejected-${++sequence}`),
    expectedRevision: expectedRevision ?? before.revision,
    operation,
    payload,
  };
  await assert.rejects(
    store.execute(command, authority),
    (error) => error instanceof DomainError && error.code === code,
  );
  assert.deepEqual(await store.snapshot(), before, "Rejected command must have no partial changes");
  trace.push({ command, authority, rejected: code });
}
const ref = (name: string, revision = 1): Ref => ({ id: key(name), revision });
async function createKnowledge(name: string, kind: "assumption" | "requirement" | "decision", reliesOn: Ref[]) {
  const found = findKnowledge(await store.snapshot(), { scope: runId, text: name, kind });
  assert.equal(found.length, 0);
  await send("knowledge.create", {
    id: key(name),
    kind,
    scope: runId,
    key: name,
    title: name,
    text: `${name} version 1`,
    rationale: `Recorded Socrates rationale for ${name}`,
    evidence: `fixture evidence for ${name}`,
    reliesOn,
  });
}
async function attach(work: string, refs: Ref[]) {
  for (const r of refs) await send("knowledge.attach", { workId: key(work), ref: r });
}
async function plan(work: string, task: string, refs: Ref[], extra: Record<string, unknown> = {}) {
  await send("task.plan", { id: key(task), workId: key(work), title: task, refs, ...extra });
}
async function baseline(work: string, label: string) {
  await send(
    "baseline.approve",
    {
      id: key(label),
      workId: key(work),
      rationale: "Operator approves the supported specification and task plan",
      evidence: "fixture operator review",
    },
    "operator",
  );
}
async function allocate(work: string, name: string) {
  await send("effect.request", { id: key(name), kind: "allocate", workId: key(work) });
  const receipt = await adapters.dispatch(key(name));
  assert.ok(receipt);
  await send(
    "effect.observe",
    {
      id: key(name),
      state: "confirmed",
      receiptId: receipt.receiptId,
      detail: "Controlled Producer allocation confirmation",
    },
    "adapter",
  );
}
async function start(work: string, task: string, attempt: string) {
  await send("attempt.start", {
    id: key(attempt),
    taskId: key(task),
    sessionId: key(`session-${work}`),
    allocationId: key(`allocation-${work}`),
  });
}
function openHolds(state: State, work: string): string[] {
  return Object.values(state.holds)
    .filter((h) => h.workId === key(work) && h.clearedBy === null)
    .map((h) => h.id);
}
async function scenario() {
  await createKnowledge("assumption", "assumption", []);
  await createKnowledge("requirement", "requirement", [ref("assumption")]);
  await createKnowledge("decision", "decision", [ref("requirement")]);
  const originalRefs = [ref("assumption"), ref("requirement"), ref("decision")];
  for (const work of ["A", "B", "unrelated"]) {
    await send("work.create", { id: key(work), title: `Body of work ${work}`, sourceRevision: "fixture:source-1" });
    await send("session.attach", { id: key(`session-${work}`), workId: key(work) });
    if (work !== "unrelated") await attach(work, originalRefs);
    await plan(work, `task-${work}`, work === "unrelated" ? [] : [ref("decision")]);
    await baseline(work, `baseline-${work}-1`);
    await allocate(work, `allocation-${work}`);
    await start(work, `task-${work}`, `attempt-${work}`);
  }
  check("Socrates records, baselines, plans and distinct allocation/attempt identities", ["R1", "R2", "R7"]);
  const before = await store.snapshot();
  assert.equal(Object.keys(before.knowledge).filter((id) => id.startsWith(runId)).length, 3);
  assert.equal(
    findKnowledge(before, { scope: runId, kind: "assumption", text: "assumption" })[0]?.id,
    key("assumption"),
  );
  const aUses = Object.values(before.uses)
    .filter((u) => u.workId === key("A"))
    .map((u) => refKey(u.ref))
    .sort();
  const bUses = Object.values(before.uses)
    .filter((u) => u.workId === key("B"))
    .map((u) => refKey(u.ref))
    .sort();
  assert.deepEqual(aUses, bUses);
  await reject("duplicate_attachment", "knowledge.attach", { workId: key("A"), ref: ref("decision") });
  await reject("not_found", "knowledge.attach", { workId: key("A"), ref: ref("missing") });
  await reject("existing_record", "knowledge.create", {
    id: key("copy"),
    kind: "assumption",
    scope: runId,
    key: "assumption",
    title: "copy",
    text: "copy",
    rationale: "copy",
    evidence: "copy",
    reliesOn: [],
  });
  check("Canonical lookup and reuse create references rather than copies", ["R4", "R10"], {
    logicalRecordCount: 3,
    references: aUses,
  });
  await send("assumption.invalidate", {
    id: key("invalidation-1"),
    ref: ref("assumption"),
    rationale: "The earlier assumption was disproven",
    evidence: "controlled counterexample",
  });
  let state = await store.snapshot();
  assert.equal(state.attempts[key("attempt-A")]?.status, "pause-requested");
  assert.equal(state.attempts[key("attempt-B")]?.status, "pause-requested");
  assert.equal(state.attempts[key("attempt-unrelated")]?.status, "running");
  assert.equal(openHolds(state, "A").length, 3);
  assert.equal(openHolds(state, "B").length, 3);
  await reject("invalid_transition", "attempt.resume", { id: key("attempt-A") });
  await reject("held", "attempt.start", {
    id: key("bypass"),
    taskId: key("task-A"),
    sessionId: key("session-A"),
    allocationId: key("allocation-A"),
  });
  await reject("invalid_transition", "verification.record", {
    id: key("held-verification"),
    attemptId: key("attempt-A"),
    baselineId: key("baseline-A-1"),
    sourceRevision: "fixture:source-1",
    command: "fixture-check",
    exitCode: 0,
    output: "fixture",
  });
  check("Shared transitive invalidation requests pauses and isolates unrelated work", ["R5", "R10"], {
    heldUses: 6,
    states: [state.attempts[key("attempt-A")]?.status, state.attempts[key("attempt-B")]?.status],
  });
  // A fresh process reconstructs from Dolt, with no inherited in-memory state.
  await store.close();
  const child = Bun.spawn([process.execPath, "src/cli.ts", "snapshot"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [childText, childError, childCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert.equal(childCode, 0, childError);
  const recovered: unknown = JSON.parse(childText);
  assert.deepEqual(recovered, state);
  store = await Store.connect();
  adapters = new ControlledAdapters(store, runId);
  await send("session.attach", { id: key("session-A-returned"), workId: key("A") });
  await reject("operator_required", "hold.reassess", {
    id: key("agent-clear"),
    workId: key("A"),
    holdIds: openHolds(state, "A"),
    rationale: "agent proposes evidence",
    evidence: "fixture",
  });
  await reject(
    "stale_revision",
    "hold.reassess",
    {
      id: key("stale-clear"),
      workId: key("A"),
      holdIds: openHolds(state, "A"),
      rationale: "stale",
      evidence: "fixture",
    },
    "operator",
    recovered.revision,
  );
  await reject(
    "invalid_basis",
    "hold.reassess",
    {
      id: key("bad-basis-clear"),
      workId: key("A"),
      holdIds: openHolds(state, "A"),
      rationale: "No revised basis",
      evidence: "fixture",
    },
    "operator",
  );
  check("Process restart recovers work and holds; agent/stale/baseless clearance fails", ["R4", "R5", "R8"]);
  // Late direct and transitive references must inherit the existing invalidation.
  await send("work.create", { id: key("late"), title: "Later body of work", sourceRevision: "fixture:source-1" });
  await send("session.attach", { id: key("session-late"), workId: key("late") });
  await attach("late", [ref("decision")]);
  assert.equal(openHolds(await store.snapshot(), "late").length, 1);
  await plan("late", "task-late", [ref("decision")]);
  await baseline("late", "baseline-late-1");
  await allocate("late", "allocation-late");
  await reject("held", "attempt.start", {
    id: key("attempt-late"),
    taskId: key("task-late"),
    sessionId: key("session-late"),
    allocationId: key("allocation-late"),
  });
  await reject("not_found", "verification.record", {
    id: key("late-verification"),
    attemptId: key("attempt-late"),
    baselineId: key("baseline-late-1"),
    sourceRevision: "fixture:source-1",
    command: "fixture-check",
    exitCode: 0,
    output: "No authorized attempt exists",
  });
  check("Later transitive attachment inherits a hold atomically", ["R5", "R10"]);
  await send("attempt.pause-ack", { id: key("attempt-A") }, "adapter");
  await send("attempt.pause-ack", { id: key("attempt-B") }, "adapter");
  await reject("held", "attempt.resume", { id: key("attempt-A") });
  await reject("adapter_required", "attempt.pause-ack", { id: key("attempt-B") });
  check("Requested pause and confirmed pause are distinct", ["R5", "R7"]);
  // A revised basis retains logical IDs, prior revisions and all historical baselines.
  await send("baseline.reopen", { workId: key("A") }, "operator");
  for (const [name, reliesOn] of [
    ["assumption", []],
    ["requirement", [ref("assumption", 2)]],
    ["decision", [ref("requirement", 2)]],
  ] as const) {
    await send("knowledge.revise", {
      id: key(name),
      text: `${name} revised with a supported replacement basis`,
      rationale: "Address the invalidated basis",
      evidence: "new controlled evidence",
      reliesOn,
    });
  }
  await attach("A", [ref("assumption", 2), ref("requirement", 2), ref("decision", 2)]);
  await plan("A", "task-A", [ref("decision", 2)]);
  await baseline("A", "baseline-A-2");
  state = await store.snapshot();
  const aHolds = openHolds(state, "A");
  await send(
    "hold.reassess",
    {
      id: key("operator-reassessment"),
      workId: key("A"),
      holdIds: aHolds,
      rationale: "Operator accepts revised baseline and replacement evidence",
      evidence: "explicit controlled operator decision",
    },
    "operator",
  );
  await send("attempt.resume", { id: key("attempt-A") });
  state = await store.snapshot();
  assert.equal(state.attempts[key("attempt-A")]?.status, "running");
  assert.equal(state.attempts[key("attempt-B")]?.status, "paused");
  assert.equal(openHolds(state, "B").length, 3);
  assert.equal(openHolds(state, "late").length, 1);
  assert.deepEqual(state.baselines[key("baseline-A-1")]?.refs, before.baselines[key("baseline-A-1")]?.refs);
  assert.equal(state.knowledge[key("assumption")]?.current, 2);
  assert.equal(Object.keys(state.knowledge).filter((id) => id.startsWith(runId)).length, 3);
  assert.equal(state.revisions[refKey(ref("assumption"))]?.text, "assumption version 1");
  check("Operator clearance is scoped; revised records retain canonical identity and history", [
    "R1",
    "R5",
    "R8",
    "R10",
  ]);
  const verificationPayload = {
    id: key("verification-A"),
    attemptId: key("attempt-A"),
    baselineId: key("baseline-A-2"),
    sourceRevision: "fixture:source-1",
    command: "fixture-check --all",
    exitCode: 0,
    output: "controlled verifier passed",
  };
  await send("verification.record", {
    ...verificationPayload,
    id: key("failed-verification"),
    exitCode: 1,
    output: "controlled verifier failed",
  });
  await reject("stale_verification", "effect.request", {
    id: key("failed-publish"),
    kind: "publish",
    workId: key("A"),
    verificationId: key("failed-verification"),
  });
  await send("verification.record", verificationPayload);
  await reject("stale_verification", "effect.request", {
    id: key("late-publish-bypass"),
    kind: "publish",
    workId: key("late"),
    verificationId: key("verification-A"),
  });
  state = await store.snapshot();
  assert.ok(verificationApplicable(state, present(state.verifications[key("verification-A")])));
  await send("effect.request", {
    id: key("publication-A"),
    kind: "publish",
    workId: key("A"),
    verificationId: key("verification-A"),
  });
  state = await store.snapshot();
  assert.ok(verificationApplicable(state, present(state.verifications[key("verification-A")])));
  assert.equal(state.effects[key("publication-A")]?.state, "pending");
  check("Verification remains applicable after recording and publication intent", ["R7", "R8"]);
  const missing = await adapters.dispatch(key("publication-A"), "lose-response");
  assert.equal(missing, null);
  await send(
    "effect.observe",
    {
      id: key("publication-A"),
      state: "uncertain",
      detail: "Controlled external effect occurred but its response was lost",
    },
    "adapter",
  );
  assert.equal((await store.snapshot()).effects[key("publication-A")]?.receiptId, null);
  const receipt = await adapters.dispatch(key("publication-A"));
  assert.ok(receipt);
  await send(
    "effect.observe",
    {
      id: key("publication-A"),
      state: "confirmed",
      receiptId: receipt.receiptId,
      detail: "Controlled Publisher receipt reconciled by stable effect ID",
    },
    "adapter",
  );
  assert.equal((await adapters.trace()).filter((x) => x.effectId === key("publication-A")).length, 1);
  check("Uncertain publication reconciles without duplicate dispatch", ["R2", "R7", "R8"], receipt);
  await send("effect.request", { id: key("failed-allocation"), kind: "allocate", workId: key("A") });
  const failed = await adapters.dispatch(key("failed-allocation"), "fail");
  assert.ok(failed);
  await send(
    "effect.observe",
    { id: key("failed-allocation"), state: "failed", detail: "Controlled allocation rejected" },
    "adapter",
  );
  await reject(
    "terminal_effect",
    "effect.observe",
    { id: key("failed-allocation"), state: "confirmed", receiptId: "cannot-rewrite", detail: "invalid" },
    "adapter",
  );
  check("Pending, failed, uncertain, and confirmed effects remain distinct", ["R2", "R7"]);
  // A source change stales verification and blocks a previously accepted pending dispatch.
  await send("effect.request", {
    id: key("pending-publication"),
    kind: "publish",
    workId: key("A"),
    verificationId: key("verification-A"),
    blockedBy: [key("publication-A")],
  });
  await send("source.update", { workId: key("A"), sourceRevision: "fixture:source-2" });
  state = await store.snapshot();
  assert.equal(verificationApplicable(state, present(state.verifications[key("verification-A")])), false);
  await reject("stale_verification", "effect.request", {
    id: key("stale-publication"),
    kind: "publish",
    workId: key("A"),
    verificationId: key("verification-A"),
  });
  await assert.rejects(
    adapters.dispatch(key("pending-publication")),
    (error) => error instanceof DomainError && error.code === "stale_verification",
  );
  assert.equal((await adapters.trace()).filter((x) => x.effectId === key("pending-publication")).length, 0);
  // An unchanged source with a replacement approved baseline also stales prior evidence.
  await send("source.update", { workId: key("A"), sourceRevision: "fixture:source-1" });
  await baseline("A", "baseline-A-3");
  state = await store.snapshot();
  assert.equal(verificationApplicable(state, present(state.verifications[key("verification-A")])), false);
  check("Source/baseline changes stale evidence and block new dispatch", ["R7", "R8"]);
  // Current verification is reacquired before delivering against the new baseline/source pair.
  await start("A", "task-A", "attempt-A-new");
  await reject("stale_verification", "verification.record", {
    ...verificationPayload,
    id: key("stale-result"),
    attemptId: key("attempt-A-new"),
  });
  await send("verification.record", {
    ...verificationPayload,
    id: key("verification-A-new"),
    attemptId: key("attempt-A-new"),
    baselineId: key("baseline-A-3"),
  });
  await send("effect.request", {
    id: key("publication-A-new"),
    kind: "publish",
    workId: key("A"),
    verificationId: key("verification-A-new"),
    blockedBy: [key("publication-A")],
  });
  const newReceipt = await adapters.dispatch(key("publication-A-new"));
  assert.ok(newReceipt);
  await send(
    "effect.observe",
    {
      id: key("publication-A-new"),
      state: "confirmed",
      receiptId: newReceipt.receiptId,
      detail: "Confirmed controlled delivery against replacement baseline",
    },
    "adapter",
  );
  check("Current evidence permits delivery while unrelated holds remain", ["R2", "R5", "R7", "R10"]);
  const beforeRepeat = await store.snapshot();
  const repeat = {
    id: key("idempotent"),
    expectedRevision: beforeRepeat.revision,
    operation: "session.attach",
    payload: { id: key("repeat-session"), workId: key("A") },
  };
  const result = await store.execute(repeat);
  assert.deepEqual(await store.execute(repeat), result);
  await assert.rejects(
    store.execute({ ...repeat, payload: { ...repeat.payload, workId: key("B") } }),
    (error) => error instanceof DomainError && error.code === "command_conflict",
  );
  await reject(
    "stale_revision",
    "session.attach",
    { id: key("stale-session"), workId: key("A") },
    "agent",
    beforeRepeat.revision,
  );
  await assert.rejects(
    store.execute({
      id: key("forged"),
      expectedRevision: (await store.snapshot()).revision,
      operation: "hold.reassess",
      payload: { actor: "operator" },
    }),
    (error) => error instanceof DomainError && error.code === "invalid_input",
  );
  check("Command replay, payload conflicts, stale revisions, and authority spoofing", ["R5", "R8"]);
  state = await store.snapshot();
  const view = renderWork(state, key("A"));
  await mkdir(resolve(output, "views"), { recursive: true });
  await writeFile(resolve(output, "views/specification.md"), view.specification);
  await writeFile(resolve(output, "views/decisions.md"), view.decisions);
  await unlink(resolve(output, "views/specification.md"));
  await writeFile(
    resolve(output, "views/specification.md"),
    renderWork(await store.snapshot(), key("A")).specification,
  );
  assert.equal(await readFile(resolve(output, "views/specification.md"), "utf8"), view.specification);
  assert.ok(view.decisions.includes(`${key("assumption")}@2`));
  const oldView = renderWork(
    {
      ...state,
      works: { ...state.works, [key("A")]: { ...present(state.works[key("A")]), baselineId: key("baseline-A-1") } },
    },
    key("A"),
  );
  assert.ok(oldView.decisions.includes("invalidated"));
  check("Generated views preserve canonical IDs, pinned revisions and historical invalidation", ["R1", "R6", "R10"]);
  await writeFile(resolve(output, "state-and-history.json"), JSON.stringify(await exportTables(store), null, 2));
  await writeFile(resolve(output, "adapter-trace.json"), JSON.stringify(await adapters.trace(), null, 2));
  const history = await store.commandHistory();
  const ownCommands = Object.keys(state.commands).filter((id) => id.startsWith(runId));
  for (const id of ownCommands)
    assert.equal(history.filter((r) => r.to_id === id).length, 1, `One introducing Dolt commit for ${id}`);
  await writeFile(
    resolve(output, "command-history.json"),
    JSON.stringify(
      history.filter((r) => r.to_id.startsWith(runId)),
      null,
      2,
    ),
  );
  check("All accepted proof commands have attributable Dolt history", ["R8", "R9"], { commands: ownCommands.length });
}
let failure: string | null = null;
store = await Store.connect();
adapters = new ControlledAdapters(store, runId);
try {
  await store.migrate();
  await scenario();
} catch (error) {
  failure = error instanceof Error ? (error.stack ?? String(error)) : String(error);
  console.error(failure);
  process.exitCode = 1;
} finally {
  try {
    await writeFile(resolve(output, "partial-state.json"), JSON.stringify(await exportTables(store), null, 2));
  } catch {
    /* preserve the original failure if storage itself is unavailable */
  }
  await store.close();
  await writeFile(
    resolve(output, "acceptance.json"),
    JSON.stringify(
      {
        runId,
        passed: failure === null,
        failure,
        checks,
        scope: "real Dolt; controlled adapters only",
        unproven: [
          "live Studio/Producer/Publisher integration",
          "production authentication",
          "multi-writer/distributed operation",
          "power-loss or remote-backup recovery",
        ],
      },
      null,
      2,
    ),
  );
  await writeFile(resolve(output, "command-trace.json"), JSON.stringify(trace, null, 2));
  const map = Object.fromEntries(
    Array.from({ length: 10 }, (_, n) => `R${n + 1}`).map((r) => [
      r,
      {
        checks: checks.filter((c) => c.requirements.includes(r)).map((c) => c.name),
        artifacts:
          r === "R3"
            ? ["../assessment.md", "run-assessment.md", "run-status.json"]
            : ["acceptance.json", "command-trace.json", "state-and-history.json"],
        status:
          r === "R3"
            ? "documented comparison; latest run outcome is separate"
            : failure === null
              ? "passed"
              : "incomplete; inspect named checks",
      },
    ]),
  );
  await writeFile(resolve(output, "requirement-evidence.json"), JSON.stringify(map, null, 2));
  console.log(`${failure === null ? "PASSED" : "FAILED"}: ${checks.length} checks; ${output}/acceptance.json`);
}
