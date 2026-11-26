import { open, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runtime } from "../scripts/runtime.ts";
import { Store } from "./store.ts";
import { isRecord, hasErrorCode } from "./input.ts";
import { requireCondition, verificationApplicable } from "./model.ts";
export type FixtureReceipt = {
  effectId: string;
  kind: "allocate" | "publish";
  state: "confirmed" | "failed";
  receiptId: string;
  target: string;
  fixture: true;
};
function parseReceipt(line: string): FixtureReceipt {
  const value: unknown = JSON.parse(line);
  requireCondition(
    isRecord(value) &&
      typeof value.effectId === "string" &&
      (value.kind === "allocate" || value.kind === "publish") &&
      (value.state === "confirmed" || value.state === "failed") &&
      typeof value.receiptId === "string" &&
      typeof value.target === "string" &&
      value.fixture === true,
    "invalid_receipt",
    "Invalid controlled adapter ledger entry",
  );
  return {
    effectId: value.effectId,
    kind: value.kind,
    state: value.state,
    receiptId: value.receiptId,
    target: value.target,
    fixture: value.fixture,
  };
}

export class ControlledAdapters {
  readonly ledger: string;
  constructor(
    readonly store: Store,
    readonly runId: string,
  ) {
    this.ledger = resolve(runtime, `effects-${runId}.jsonl`);
  }
  async trace(): Promise<FixtureReceipt[]> {
    try {
      return (await readFile(this.ledger, "utf8")).split("\n").filter(Boolean).map(parseReceipt);
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return [];
      throw error;
    }
  }
  async dispatch(
    effectId: string,
    mode: "confirm" | "lose-response" | "fail" = "confirm",
  ): Promise<FixtureReceipt | null> {
    // Reconciliation observes an existing external result even if work was held later.
    const existing = (await this.trace()).find((r) => r.effectId === effectId);
    if (existing) return existing;
    const state = await this.store.snapshot();
    const effect = state.effects[effectId];
    requireCondition(effect, "not_found", "Unknown effect request");
    requireCondition(
      effect.state === "pending",
      "invalid_transition",
      "Only a pending intent may dispatch a new effect",
    );
    if (effect.kind === "publish") {
      const verification = effect.verificationId === null ? undefined : state.verifications[effect.verificationId];
      requireCondition(
        verification && verificationApplicable(state, verification),
        "stale_verification",
        "Revalidate current verification immediately before dispatch",
      );
      requireCondition(
        effect.blockedBy.every((id) => state.effects[id]?.state === "confirmed"),
        "publish_blocked",
        "Publication dependencies changed",
      );
    }
    const receipt: FixtureReceipt = {
      effectId,
      kind: effect.kind,
      state: mode === "fail" ? "failed" : "confirmed",
      receiptId: `fixture-receipt:${effectId}`,
      target: `fixture://${effect.kind}/${effectId}`,
      fixture: true,
    };
    const file = await open(this.ledger, "a");
    try {
      await file.writeFile(JSON.stringify(receipt) + "\n");
      await file.sync();
    } finally {
      await file.close();
    }
    return mode === "lose-response" ? null : receipt;
  }
}
