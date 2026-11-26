import { isRecord } from "./input.ts";

export type Ref = {
  id: string;
  revision: number;
};
export type KnowledgeKind = "requirement" | "assumption" | "decision";
export type Authority = "agent" | "operator" | "adapter";
export type Knowledge = {
  id: string;
  kind: KnowledgeKind;
  scope: string;
  key: string;
  title: string;
  current: number;
};
export type Revision = {
  id: string;
  recordId: string;
  revision: number;
  text: string;
  rationale: string;
  evidence: string;
  reliesOn: Ref[];
  derivedFrom: Ref | null;
};
export type Work = {
  id: string;
  title: string;
  baselineId: string | null;
  sourceRevision: string;
};
export type Use = {
  id: string;
  workId: string;
  ref: Ref;
  active: boolean;
};
export type Task = {
  id: string;
  workId: string;
  title: string;
  revision: number;
  refs: Ref[];
  blockedBy: string[];
  parentId: string | null;
};
export type Baseline = {
  id: string;
  workId: string;
  refs: Ref[];
  tasks: Task[];
  approvedBy: "operator";
  rationale: string;
  evidence: string;
};
export type Attempt = {
  id: string;
  workId: string;
  taskId: string;
  sessionId: string;
  allocationId: string;
  baselineId: string;
  sourceRevision: string;
  status: "running" | "pause-requested" | "paused" | "verified";
};
export type Invalidation = {
  id: string;
  ref: Ref;
  rationale: string;
  evidence: string;
};
export type Hold = {
  id: string;
  workId: string;
  useId: string;
  invalidationId: string;
  taskIds: string[];
  clearedBy: string | null;
};
export type Reassessment = {
  id: string;
  workId: string;
  holdIds: string[];
  baselineId: string;
  rationale: string;
  evidence: string;
  actor: "operator";
};
export type Verification = {
  id: string;
  attemptId: string;
  baselineId: string;
  sourceRevision: string;
  command: string;
  exitCode: number;
  output: string;
};
export type Effect = {
  id: string;
  kind: "allocate" | "publish";
  workId: string;
  taskId: string | null;
  verificationId: string | null;
  baselineId: string | null;
  sourceRevision: string;
  blockedBy: string[];
  state: "pending" | "uncertain" | "failed" | "confirmed";
  receiptId: string | null;
  detail: string;
};
export type Command = {
  id: string;
  expectedRevision: number;
  operation: string;
  payload: Record<string, unknown>;
};
export type Outcome = {
  commandId: string;
  revision: number;
  eventIds: string[];
  result: unknown;
};
export type Event = {
  id: string;
  revision: number;
  operation: string;
  authority: Authority;
  payload: Record<string, unknown>;
  result: unknown;
  recordedAt: string;
};
export type Receipt = {
  id: string;
  hash: string;
  authority: Authority;
  outcome: Outcome;
};
export type State = {
  revision: number;
  works: Record<string, Work>;
  knowledge: Record<string, Knowledge>;
  revisions: Record<string, Revision>;
  uses: Record<string, Use>;
  sessions: Record<
    string,
    {
      id: string;
      workId: string;
    }
  >;
  tasks: Record<string, Task>;
  baselines: Record<string, Baseline>;
  attempts: Record<string, Attempt>;
  invalidations: Record<string, Invalidation>;
  holds: Record<string, Hold>;
  reassessments: Record<string, Reassessment>;
  verifications: Record<string, Verification>;
  effects: Record<string, Effect>;
  events: Record<string, Event>;
  commands: Record<string, Receipt>;
};
export const tables = [
  "works",
  "knowledge",
  "revisions",
  "uses",
  "sessions",
  "tasks",
  "baselines",
  "attempts",
  "invalidations",
  "holds",
  "reassessments",
  "verifications",
  "effects",
  "events",
  "commands",
] as const;
export type Table = (typeof tables)[number];
export function emptyState(): State {
  return {
    revision: 0,
    works: {},
    knowledge: {},
    revisions: {},
    uses: {},
    sessions: {},
    tasks: {},
    baselines: {},
    attempts: {},
    invalidations: {},
    holds: {},
    reassessments: {},
    verifications: {},
    effects: {},
    events: {},
    commands: {},
  };
}
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
export function requireCondition(condition: unknown, code: string, message: string): asserts condition {
  if (!Boolean(condition)) throw new DomainError(code, message);
}
function object(value: unknown): Record<string, unknown> {
  requireCondition(isRecord(value), "invalid_input", "Expected an object");
  return value;
}
function text(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  requireCondition(
    typeof v === "string" && v.trim().length > 0 && v.length <= 16000,
    "invalid_input",
    `Expected nonempty ${key}`,
  );
  return v;
}
function integer(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  requireCondition(typeof v === "number" && Number.isSafeInteger(v), "invalid_input", `Expected integer ${key}`);
  return v;
}
function reference(value: unknown): Ref {
  const p = object(value);
  const revision = integer(p, "revision");
  requireCondition(revision > 0, "invalid_input", "Positive record revision required");
  return { id: text(p, "id"), revision };
}
function references(value: unknown): Ref[] {
  requireCondition(Array.isArray(value), "invalid_input", "Expected references");
  const refs = value.map(reference);
  requireCondition(new Set(refs.map(refKey)).size === refs.length, "duplicate_reference", "Duplicate references");
  return refs;
}
function strings(value: unknown): string[] {
  requireCondition(Array.isArray(value), "invalid_input", "Expected string IDs");
  const values: unknown[] = value;
  requireCondition(
    values.every((item): item is string => typeof item === "string" && item.length > 0),
    "invalid_input",
    "Expected string IDs",
  );
  requireCondition(new Set(values).size === values.length, "duplicate_reference", "Duplicate IDs");
  return values;
}
function get<T>(values: Record<string, T>, id: string): T {
  const value = values[id];
  requireCondition(value !== undefined, "not_found", `Missing record ${id}`);
  return value;
}
function insert<
  T extends {
    id: string;
  },
>(values: Record<string, T>, value: T) {
  requireCondition(values[value.id] === undefined, "duplicate_id", `Record ${value.id} already exists`);
  values[value.id] = value;
}
export const refKey = (ref: Ref) => JSON.stringify([ref.id, ref.revision]);
export function revisionOf(s: State, ref: Ref): Revision {
  return get(s.revisions, refKey(ref));
}
export function closure(s: State, roots: Ref[]): Ref[] {
  const seen = new Map<string, Ref>();
  const queue = [...roots];
  for (let r = queue.pop(); r; r = queue.pop()) {
    if (seen.has(refKey(r))) continue;
    const record = revisionOf(s, r);
    seen.set(refKey(r), r);
    queue.push(...record.reliesOn);
  }
  return [...seen.values()];
}
function affected(s: State, roots: Ref[], invalidation: Invalidation): boolean {
  return closure(s, roots).some((r) => refKey(r) === refKey(invalidation.ref));
}
function invalidFor(s: State, roots: Ref[]): Invalidation[] {
  return Object.values(s.invalidations).filter((i) => affected(s, roots, i));
}
function activeUses(s: State, workId: string): Use[] {
  return Object.values(s.uses).filter((u) => u.workId === workId && u.active);
}
function applicableHolds(s: State, task: Task): Hold[] {
  return Object.values(s.holds).filter(
    (h) =>
      h.workId === task.workId &&
      h.clearedBy === null &&
      (h.taskIds.includes(task.id) || affected(s, task.refs, get(s.invalidations, h.invalidationId))),
  );
}
function currentBaseline(s: State, work: Work): Baseline {
  requireCondition(work.baselineId !== null, "no_baseline", "An approved baseline is required");
  return get(s.baselines, work.baselineId);
}
function taskBaseline(s: State, task: Task): Baseline {
  const baseline = currentBaseline(s, get(s.works, task.workId));
  requireCondition(
    baselineCurrent(s, baseline),
    "stale_baseline",
    "Canonical uses or task plan changed since approval",
  );
  requireCondition(
    baseline.tasks.some((t) => JSON.stringify(t) === JSON.stringify(task)),
    "stale_baseline",
    "Task changed since baseline approval",
  );
  return baseline;
}
function runnable(s: State, task: Task) {
  taskBaseline(s, task);
  requireCondition(
    applicableHolds(s, task).length === 0 && invalidFor(s, task.refs).length === 0,
    "held",
    "Applicable invalidation hold prevents advancement",
  );
  for (const id of task.blockedBy)
    requireCondition(
      Object.values(s.verifications).some((v) => {
        const a = s.attempts[v.attemptId];
        return a?.taskId === id && verificationApplicable(s, v);
      }),
      "task_blocked",
      `Task dependency ${id} lacks applicable verification`,
    );
}
function baselineCurrent(s: State, baseline: Baseline): boolean {
  const refs = closure(
    s,
    activeUses(s, baseline.workId).map((u) => u.ref),
  )
    .map(refKey)
    .sort();
  return (
    JSON.stringify(refs) === JSON.stringify(baseline.refs.map(refKey).sort()) &&
    Object.values(s.tasks)
      .filter((t) => t.workId === baseline.workId)
      .every((t) => baseline.tasks.some((b) => JSON.stringify(t) === JSON.stringify(b))) &&
    baseline.tasks.length === Object.values(s.tasks).filter((t) => t.workId === baseline.workId).length
  );
}
export function verificationApplicable(s: State, v: Verification): boolean {
  const attempt = get(s.attempts, v.attemptId);
  const work = get(s.works, attempt.workId);
  const task = get(s.tasks, attempt.taskId);
  return (
    v.exitCode === 0 &&
    work.baselineId === v.baselineId &&
    work.sourceRevision === v.sourceRevision &&
    attempt.baselineId === v.baselineId &&
    attempt.sourceRevision === v.sourceRevision &&
    baselineCurrent(s, get(s.baselines, v.baselineId)) &&
    applicableHolds(s, task).length === 0 &&
    invalidFor(s, task.refs).length === 0
  );
}
function refreshHolds(s: State) {
  for (const use of Object.values(s.uses).filter((u) => u.active)) {
    for (const invalidation of invalidFor(s, [use.ref])) {
      const id = JSON.stringify([use.id, invalidation.id, s.revision + 1]);
      const taskIds = Object.values(s.tasks)
        .filter((t) => t.workId === use.workId && affected(s, t.refs, invalidation))
        .map((t) => t.id)
        .sort();
      const existing = Object.values(s.holds).find(
        (h) => h.useId === use.id && h.invalidationId === invalidation.id && h.clearedBy === null,
      );
      if (!existing)
        s.holds[id] = {
          id,
          workId: use.workId,
          useId: use.id,
          invalidationId: invalidation.id,
          taskIds,
          clearedBy: null,
        };
      else existing.taskIds = [...new Set([...existing.taskIds, ...taskIds])].sort();
    }
  }
  for (const attempt of Object.values(s.attempts)) {
    if (attempt.status === "running" && applicableHolds(s, get(s.tasks, attempt.taskId)).length > 0)
      attempt.status = "pause-requested";
  }
}
type KnowledgeQuery = { id?: string; kind?: string; scope?: string; text?: string };

export function parseKnowledgeQuery(input: unknown): KnowledgeQuery {
  const fields = object(input);
  const query: KnowledgeQuery = {};
  for (const field of ["id", "kind", "scope", "text"] as const) {
    const value = fields[field];
    if (value === undefined) continue;
    requireCondition(typeof value === "string", "invalid_input", "Expected string " + field);
    query[field] = value;
  }
  return query;
}

export function findKnowledge(s: State, query: KnowledgeQuery): Knowledge[] {
  const { id = "", kind = "", scope = "", text = "" } = query;
  return Object.values(s.knowledge).filter(
    (k) =>
      (id === "" || k.id === id) &&
      (kind === "" || k.kind === kind) &&
      (scope === "" || k.scope === scope) &&
      (text === "" ||
        `${k.key} ${k.title} ${revisionOf(s, { id: k.id, revision: k.current }).text}`
          .toLowerCase()
          .includes(text.toLowerCase())),
  );
}
export function parseCommand(input: unknown): Command {
  const c = object(input);
  requireCondition(
    Object.keys(c).every((k) => ["id", "expectedRevision", "operation", "payload"].includes(k)),
    "invalid_input",
    "Unknown command field (authority is supplied by the trusted entry point)",
  );
  const expectedRevision = integer(c, "expectedRevision");
  requireCondition(expectedRevision >= 0, "invalid_input", "Expected nonnegative revision");
  const payload = object(c.payload);
  requireCondition(
    !("actor" in payload) && !("authority" in payload),
    "invalid_input",
    "Authority is not a payload field",
  );
  return { id: text(c, "id"), operation: text(c, "operation"), expectedRevision, payload };
}
export function applyCommand(s: State, command: Command, authority: Authority): unknown {
  const p = command.payload;
  const id = () => text(p, "id");
  const operator = () => {
    requireCondition(authority === "operator", "operator_required", "Explicit operator decision required");
  };
  const adapter = () => {
    requireCondition(authority === "adapter", "adapter_required", "Trusted adapter observation required");
  };
  let result: unknown;
  switch (command.operation) {
    case "work.create": {
      const row: Work = {
        id: id(),
        title: text(p, "title"),
        baselineId: null,
        sourceRevision: text(p, "sourceRevision"),
      };
      insert(s.works, row);
      result = row;
      break;
    }
    case "session.attach": {
      const row = { id: id(), workId: text(p, "workId") };
      get(s.works, row.workId);
      insert(s.sessions, row);
      result = row;
      break;
    }
    case "knowledge.create": {
      const kind = text(p, "kind");
      requireCondition(
        kind === "requirement" || kind === "assumption" || kind === "decision",
        "invalid_input",
        "Unknown knowledge kind",
      );
      const scope = text(p, "scope"),
        key = text(p, "key");
      requireCondition(
        !Object.values(s.knowledge).some((k) => k.kind === kind && k.scope === scope && k.key === key),
        "existing_record",
        "Canonical key exists; find and attach its ID",
      );
      const reliesOn = references(p.reliesOn ?? []);
      reliesOn.forEach((r) => revisionOf(s, r));
      const derivedFrom = p.derivedFrom == null ? null : reference(p.derivedFrom);
      if (derivedFrom) revisionOf(s, derivedFrom);
      const row: Knowledge = { id: id(), kind, scope, key, title: text(p, "title"), current: 1 };
      insert(s.knowledge, row);
      const revision: Revision = {
        id: refKey({ id: row.id, revision: 1 }),
        recordId: row.id,
        revision: 1,
        text: text(p, "text"),
        rationale: text(p, "rationale"),
        evidence: text(p, "evidence"),
        reliesOn,
        derivedFrom,
      };
      insert(s.revisions, revision);
      result = { id: row.id, revision: 1 };
      break;
    }
    case "knowledge.revise": {
      const k = get(s.knowledge, id());
      const reliesOn = references(p.reliesOn);
      reliesOn.forEach((r) => revisionOf(s, r));
      const next = k.current + 1;
      const row: Revision = {
        id: refKey({ id: k.id, revision: next }),
        recordId: k.id,
        revision: next,
        text: text(p, "text"),
        rationale: text(p, "rationale"),
        evidence: text(p, "evidence"),
        reliesOn,
        derivedFrom: { id: k.id, revision: k.current },
      };
      insert(s.revisions, row);
      k.current = next;
      result = { id: k.id, revision: next };
      break;
    }
    case "knowledge.attach": {
      const workId = text(p, "workId"),
        ref = reference(p.ref);
      get(s.works, workId);
      revisionOf(s, ref);
      const useId = JSON.stringify([workId, ref.id, ref.revision]);
      requireCondition(
        s.uses[useId]?.active !== true,
        "duplicate_attachment",
        "This canonical revision is already attached",
      );
      for (const use of activeUses(s, workId)) if (use.ref.id === ref.id) use.active = false;
      s.uses[useId] = { id: useId, workId, ref, active: true };
      refreshHolds(s);
      result = s.uses[useId];
      break;
    }
    case "task.plan": {
      const workId = text(p, "workId");
      get(s.works, workId);
      const refs = references(p.refs);
      closure(s, refs);
      requireCondition(
        refs.every((r) => activeUses(s, workId).some((u) => refKey(u.ref) === refKey(r))),
        "unattached_reference",
        "Attach canonical task roots to this work first",
      );
      const prior = s.tasks[id()];
      requireCondition(!prior || prior.workId === workId, "wrong_work", "Task identity cannot move between work items");
      const blockedBy = strings(p.blockedBy ?? []);
      blockedBy.forEach((b) => {
        const task = get(s.tasks, b);
        requireCondition(
          task.workId === workId && b !== id(),
          "invalid_dependency",
          "Task blocker must be another task in this work",
        );
      });
      const parentId = p.parentId == null ? null : text(p, "parentId");
      if (parentId !== null)
        requireCondition(
          get(s.tasks, parentId).workId === workId && parentId !== id(),
          "invalid_dependency",
          "Invalid containment parent",
        );
      const row: Task = {
        id: id(),
        workId,
        title: text(p, "title"),
        revision: (prior?.revision ?? 0) + 1,
        refs,
        blockedBy,
        parentId,
      };
      s.tasks[row.id] = row;
      const visit = (at: string, path: Set<string>, field: "blockedBy" | "parentId") => {
        requireCondition(!path.has(at), "cycle", "Task graph cannot contain a cycle");
        const t = get(s.tasks, at);
        const next = field === "blockedBy" ? t.blockedBy : t.parentId === null ? [] : [t.parentId];
        for (const n of next) visit(n, new Set([...path, at]), field);
      };
      visit(row.id, new Set(), "blockedBy");
      visit(row.id, new Set(), "parentId");
      refreshHolds(s);
      result = row;
      break;
    }
    case "baseline.approve": {
      operator();
      const work = get(s.works, text(p, "workId"));
      const uses = activeUses(s, work.id);
      const tasks = Object.values(s.tasks).filter((t) => t.workId === work.id);
      requireCondition(
        tasks.every((t) => t.refs.every((r) => uses.some((u) => refKey(u.ref) === refKey(r)))),
        "unattached_reference",
        "Task plan refers to a superseded attachment; revise it before approving",
      );
      const refs = closure(
        s,
        uses.map((u) => u.ref),
      );
      // Every relied-on revision is pinned, including dependencies not attached as roots.
      const row: Baseline = {
        id: id(),
        workId: work.id,
        refs,
        tasks: structuredClone(tasks),
        approvedBy: "operator",
        rationale: text(p, "rationale"),
        evidence: text(p, "evidence"),
      };
      requireCondition(row.tasks.length > 0, "empty_plan", "Baseline requires a task plan");
      insert(s.baselines, row);
      work.baselineId = row.id;
      result = row;
      break;
    }
    case "baseline.reopen": {
      operator();
      const work = get(s.works, text(p, "workId"));
      currentBaseline(s, work);
      work.baselineId = null;
      result = work;
      break;
    }
    case "source.update": {
      const work = get(s.works, text(p, "workId"));
      work.sourceRevision = text(p, "sourceRevision");
      result = work;
      break;
    }
    case "effect.request": {
      const kind = text(p, "kind");
      requireCondition(kind === "allocate" || kind === "publish", "invalid_input", "Unknown effect kind");
      const work = get(s.works, text(p, "workId"));
      let taskId: string | null = null,
        verificationId: string | null = null,
        baselineId: string | null = null;
      const blockedBy = strings(p.blockedBy ?? []);
      if (kind === "publish") {
        verificationId = text(p, "verificationId");
        const verification = get(s.verifications, verificationId);
        const attempt = get(s.attempts, verification.attemptId);
        requireCondition(
          attempt.workId === work.id && verificationApplicable(s, verification),
          "stale_verification",
          "Publication requires applicable passing verification",
        );
        taskId = attempt.taskId;
        runnable(s, get(s.tasks, taskId));
        baselineId = verification.baselineId;
        for (const dep of blockedBy) {
          const e = get(s.effects, dep);
          requireCondition(
            e.kind === "publish" && e.state === "confirmed",
            "publish_blocked",
            "Publish dependency is not confirmed",
          );
        }
      } else requireCondition(blockedBy.length === 0, "invalid_dependency", "Allocation has no publish dependencies");
      const row: Effect = {
        id: id(),
        kind,
        workId: work.id,
        taskId,
        verificationId,
        baselineId,
        sourceRevision: work.sourceRevision,
        blockedBy,
        state: "pending",
        receiptId: null,
        detail: "Intent recorded before dispatch",
      };
      insert(s.effects, row);
      result = row;
      break;
    }
    case "effect.observe": {
      adapter();
      const effect = get(s.effects, id());
      const status = text(p, "state");
      requireCondition(
        status === "uncertain" || status === "failed" || status === "confirmed",
        "invalid_input",
        "Invalid observation",
      );
      requireCondition(
        effect.state !== "confirmed" && effect.state !== "failed",
        "terminal_effect",
        "A terminal effect cannot be rewritten",
      );
      const receiptId = status === "confirmed" ? text(p, "receiptId") : null;
      if (receiptId !== null)
        requireCondition(
          !Object.values(s.effects).some((e) => e.receiptId === receiptId),
          "duplicate_receipt",
          "Receipt already belongs to an effect",
        );
      effect.state = status;
      effect.receiptId = receiptId;
      effect.detail = text(p, "detail");
      result = effect;
      break;
    }
    case "attempt.start": {
      const task = get(s.tasks, text(p, "taskId"));
      runnable(s, task);
      const work = get(s.works, task.workId);
      const allocation = get(s.effects, text(p, "allocationId"));
      requireCondition(
        allocation.kind === "allocate" && allocation.workId === work.id && allocation.state === "confirmed",
        "allocation_unconfirmed",
        "A confirmed matching allocation is required",
      );
      const session = get(s.sessions, text(p, "sessionId"));
      requireCondition(session.workId === work.id, "wrong_session", "Session belongs to different work");
      requireCondition(
        !Object.values(s.attempts).some(
          (a) => a.taskId === task.id && ["running", "paused", "pause-requested"].includes(a.status),
        ),
        "active_attempt",
        "Task already has an active attempt",
      );
      const row: Attempt = {
        id: id(),
        workId: work.id,
        taskId: task.id,
        sessionId: session.id,
        allocationId: allocation.id,
        baselineId: taskBaseline(s, task).id,
        sourceRevision: work.sourceRevision,
        status: "running",
      };
      insert(s.attempts, row);
      result = row;
      break;
    }
    case "assumption.invalidate": {
      const ref = reference(p.ref);
      revisionOf(s, ref);
      requireCondition(
        get(s.knowledge, ref.id).kind === "assumption",
        "wrong_kind",
        "Only an assumption may be invalidated",
      );
      requireCondition(
        !Object.values(s.invalidations).some((i) => refKey(i.ref) === refKey(ref)),
        "already_invalidated",
        "Assumption revision is already invalidated",
      );
      const row: Invalidation = { id: id(), ref, rationale: text(p, "rationale"), evidence: text(p, "evidence") };
      insert(s.invalidations, row);
      refreshHolds(s);
      result = { invalidation: row, holds: Object.values(s.holds).filter((h) => h.invalidationId === row.id) };
      break;
    }
    case "attempt.pause-ack": {
      adapter();
      const attempt = get(s.attempts, id());
      requireCondition(attempt.status === "pause-requested", "invalid_transition", "Pause must be requested first");
      attempt.status = "paused";
      result = attempt;
      break;
    }
    case "hold.reassess": {
      operator();
      const work = get(s.works, text(p, "workId"));
      const baseline = currentBaseline(s, work);
      requireCondition(
        baselineCurrent(s, baseline) && invalidFor(s, baseline.refs).length === 0,
        "invalid_basis",
        "Approve a revised baseline addressing invalidated assumptions first",
      );
      const holdIds = strings(p.holdIds);
      requireCondition(holdIds.length > 0, "invalid_input", "Name the holds being reassessed");
      for (const h of holdIds) {
        const hold = get(s.holds, h);
        requireCondition(
          hold.workId === work.id && hold.clearedBy === null,
          "wrong_hold",
          "Hold is not current for this work",
        );
      }
      const row: Reassessment = {
        id: id(),
        workId: work.id,
        holdIds,
        baselineId: baseline.id,
        rationale: text(p, "rationale"),
        evidence: text(p, "evidence"),
        actor: "operator",
      };
      insert(s.reassessments, row);
      for (const h of holdIds) get(s.holds, h).clearedBy = row.id;
      result = row;
      break;
    }
    case "attempt.resume": {
      const attempt = get(s.attempts, id());
      requireCondition(attempt.status === "paused", "invalid_transition", "Only a confirmed paused attempt can resume");
      const task = get(s.tasks, attempt.taskId);
      runnable(s, task);
      const work = get(s.works, attempt.workId);
      attempt.baselineId = taskBaseline(s, task).id;
      attempt.sourceRevision = work.sourceRevision;
      attempt.status = "running";
      result = attempt;
      break;
    }
    case "verification.record": {
      const attempt = get(s.attempts, text(p, "attemptId"));
      requireCondition(attempt.status === "running", "invalid_transition", "Verification requires running work");
      const task = get(s.tasks, attempt.taskId);
      runnable(s, task);
      const baselineId = text(p, "baselineId"),
        sourceRevision = text(p, "sourceRevision"),
        work = get(s.works, attempt.workId);
      requireCondition(
        work.baselineId === baselineId &&
          attempt.baselineId === baselineId &&
          work.sourceRevision === sourceRevision &&
          attempt.sourceRevision === sourceRevision &&
          baselineCurrent(s, get(s.baselines, baselineId)),
        "stale_verification",
        "Verification baseline/source is stale",
      );
      const row: Verification = {
        id: id(),
        attemptId: attempt.id,
        baselineId,
        sourceRevision,
        command: text(p, "command"),
        exitCode: integer(p, "exitCode"),
        output: text(p, "output"),
      };
      insert(s.verifications, row);
      if (row.exitCode === 0) attempt.status = "verified";
      result = row;
      break;
    }
    default:
      throw new DomainError("unknown_operation", `Unknown operation ${command.operation}`);
  }
  return structuredClone(result);
}
export function renderWork(
  s: State,
  workId: string,
): {
  specification: string;
  decisions: string;
} {
  const work = get(s.works, workId);
  const baseline = work.baselineId === null ? null : get(s.baselines, work.baselineId);
  const refs =
    baseline?.refs ??
    closure(
      s,
      activeUses(s, workId).map((u) => u.ref),
    );
  const rows = refs
    .map((r) => {
      const k = get(s.knowledge, r.id),
        v = revisionOf(s, r);
      return { k, v, r };
    })
    .sort((a, b) => refKey(a.r).localeCompare(refKey(b.r)));
  const heading = `# ${work.title}\n\nWork: ${work.id}; baseline: ${baseline?.id ?? "draft"}; store revision: ${s.revision}\n\nGenerated view; edit canonical records through commands.\n`;
  const specification =
    heading +
    rows
      .filter((x) => x.k.kind === "requirement")
      .map(({ k, v, r }) => `\n## ${k.title} [${r.id}@${r.revision}]\n\n${v.text}\n\nEvidence: ${v.evidence}\n`)
      .join("") +
    "\n## Work breakdown\n" +
    (baseline?.tasks ?? Object.values(s.tasks).filter((t) => t.workId === workId))
      .map(
        (t) =>
          `\n- ${t.id}@${t.revision}: ${t.title}; references: ${t.refs.map((r) => `${r.id}@${r.revision}`).join(", ")}\n`,
      )
      .join("");
  const decisions =
    heading +
    rows
      .filter((x) => x.k.kind !== "requirement")
      .map(
        ({ k, v, r }) =>
          `\n## ${k.kind}: ${k.title} [${r.id}@${r.revision}]\n\n${v.text}\n\nRationale: ${v.rationale}\n\nEvidence: ${v.evidence}\n\nStatus: ${invalidFor(s, [r]).length > 0 ? "invalidated or affected by invalidation" : "no recorded invalidation"}\n\nRelies on: ${v.reliesOn.length === 0 ? "none" : v.reliesOn.map((r) => `${r.id}@${r.revision}`).join(", ")}\n`,
      )
      .join("");
  return { specification, decisions };
}
