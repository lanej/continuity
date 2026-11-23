import { describe, expect, test } from "bun:test";
import { applyCommand, emptyState, closure, refKey, type Authority, type Ref } from "../src/model.ts";
function fixture() {
    const s = emptyState();
    let n = 0;
    const mutate = (operation: string, payload: Record<string, unknown>, authority: Authority = "agent") => {
        const next = structuredClone(s);
        const result = applyCommand(next, { id: `test-${++n}`, expectedRevision: s.revision, operation, payload }, authority);
        next.revision++;
        Object.assign(s, next);
        return result;
    };
    mutate("work.create", { id: "work", title: "work", sourceRevision: "source" });
    mutate("knowledge.create", { id: "a", kind: "assumption", scope: "test", key: "a", title: "a", text: "basis", rationale: "reason", evidence: "evidence", reliesOn: [] });
    return { s, mutate };
}
const a: Ref = { id: "a", revision: 1 };
describe("canonical references and lifecycle boundaries", () => {
    test("transitive baseline pins include dependencies attached only through a root", () => {
        const { s, mutate } = fixture();
        mutate("knowledge.create", { id: "d", kind: "decision", scope: "test", key: "d", title: "d", text: "choice", rationale: "reason", evidence: "evidence", reliesOn: [a] });
        mutate("knowledge.attach", { workId: "work", ref: { id: "d", revision: 1 } });
        mutate("task.plan", { id: "task", workId: "work", title: "task", refs: [{ id: "d", revision: 1 }] });
        mutate("baseline.approve", { id: "baseline", workId: "work", rationale: "review", evidence: "evidence" }, "operator");
        expect(s.baselines.baseline?.refs.map(refKey).sort()).toEqual([refKey(a), refKey({ id: "d", revision: 1 })].sort());
        expect(closure(s, [{ id: "d", revision: 1 }])).toHaveLength(2);
    });
    test("a previously cleared invalidated revision gets a new hold when attached again", () => {
        const { s, mutate } = fixture();
        mutate("knowledge.attach", { workId: "work", ref: a });
        mutate("task.plan", { id: "task", workId: "work", title: "task", refs: [a] });
        mutate("assumption.invalidate", { id: "invalid", ref: a, rationale: "counterexample", evidence: "evidence" });
        const original = Object.values(s.holds).map(h => h.id);
        mutate("knowledge.revise", { id: "a", text: "supported basis", rationale: "replacement", evidence: "new evidence", reliesOn: [] });
        mutate("knowledge.attach", { workId: "work", ref: { id: "a", revision: 2 } });
        mutate("task.plan", { id: "task", workId: "work", title: "task", refs: [{ id: "a", revision: 2 }] });
        mutate("baseline.approve", { id: "new", workId: "work", rationale: "review", evidence: "evidence" }, "operator");
        mutate("hold.reassess", { id: "review", workId: "work", holdIds: original, rationale: "replacement accepted", evidence: "evidence" }, "operator");
        mutate("knowledge.attach", { workId: "work", ref: a });
        const active = Object.values(s.holds).filter(h => h.clearedBy === null);
        expect(active).toHaveLength(1);
        expect(active[0]?.id).not.toBe(original[0]);
        expect(s.holds[original[0]!]!.clearedBy).toBe("review");
    });
    test("approving a baseline cannot hide a task's superseded attachment", () => {
        const { s, mutate } = fixture();
        mutate("knowledge.attach", { workId: "work", ref: a });
        mutate("task.plan", { id: "task", workId: "work", title: "task", refs: [a] });
        mutate("knowledge.revise", { id: "a", text: "new", rationale: "reason", evidence: "evidence", reliesOn: [] });
        mutate("knowledge.attach", { workId: "work", ref: { id: "a", revision: 2 } });
        expect(() => mutate("baseline.approve", { id: "bad", workId: "work", rationale: "review", evidence: "evidence" }, "operator")).toThrow(expect.objectContaining({ code: "unattached_reference" }));
        expect(s.baselines.bad).toBeUndefined();
    });
    test("task ordering cycles and containment cycles are rejected independently", () => {
        const { mutate } = fixture();
        mutate("task.plan", { id: "one", workId: "work", title: "one", refs: [] });
        mutate("task.plan", { id: "two", workId: "work", title: "two", refs: [], blockedBy: ["one"], parentId: "one" });
        expect(() => mutate("task.plan", { id: "one", workId: "work", title: "one", refs: [], blockedBy: ["two"] })).toThrow(expect.objectContaining({ code: "cycle" }));
        expect(() => mutate("task.plan", { id: "one", workId: "work", title: "one", refs: [], parentId: "two" })).toThrow(expect.objectContaining({ code: "cycle" }));
    });
    test("a reassessment cannot clear another work item's hold", () => {
        const { s, mutate } = fixture();
        mutate("work.create", { id: "other", title: "other", sourceRevision: "source" });
        mutate("knowledge.attach", { workId: "other", ref: a });
        mutate("assumption.invalidate", { id: "invalid", ref: a, rationale: "invalid", evidence: "evidence" });
        mutate("task.plan", { id: "task", workId: "work", title: "independent", refs: [] });
        mutate("baseline.approve", { id: "baseline", workId: "work", rationale: "review", evidence: "evidence" }, "operator");
        expect(() => mutate("hold.reassess", { id: "bad", workId: "work", holdIds: Object.keys(s.holds), rationale: "reason", evidence: "evidence" }, "operator")).toThrow(expect.objectContaining({ code: "wrong_hold" }));
        expect(Object.values(s.holds).every(h => h.clearedBy === null)).toBe(true);
    });
    test("reassessment of an earlier invalidation leaves a later hold in force", () => {
        const { s, mutate } = fixture();
        mutate("knowledge.attach", { workId: "work", ref: a });
        mutate("task.plan", { id: "task", workId: "work", title: "task", refs: [a] });
        mutate("assumption.invalidate", { id: "first", ref: a, rationale: "first counterexample", evidence: "evidence" });
        const firstHolds = Object.keys(s.holds);
        for (const revision of [2, 3]) {
            mutate("knowledge.revise", { id: "a", text: `basis ${revision}`, rationale: "replacement", evidence: "evidence", reliesOn: [] });
            mutate("knowledge.attach", { workId: "work", ref: { id: "a", revision } });
            mutate("task.plan", { id: "task", workId: "work", title: "task", refs: [{ id: "a", revision }] });
            mutate("baseline.approve", { id: `baseline-${revision}`, workId: "work", rationale: "review", evidence: "evidence" }, "operator");
            if (revision === 2)
                mutate("assumption.invalidate", { id: "later", ref: { id: "a", revision }, rationale: "later counterexample", evidence: "evidence" });
        }
        mutate("hold.reassess", { id: "partial-review", workId: "work", holdIds: firstHolds, rationale: "Only first invalidation reviewed", evidence: "evidence" }, "operator");
        expect(Object.values(s.holds).filter(h => h.clearedBy === null)).toHaveLength(1);
        expect(() => mutate("attempt.start", { id: "bypass", taskId: "task", sessionId: "none", allocationId: "none" })).toThrow(expect.objectContaining({ code: "held" }));
    });
});
