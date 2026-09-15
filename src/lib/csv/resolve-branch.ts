/**
 * Bulk-import branch handling.
 *
 * Unknown CSV branch names are accepted and auto-created via /api/org/units
 * so HR does not have to pre-register them on Organization. Blank stays Unassigned.
 * Per-row "is not registered" errors are stripped — a failed auto-create is one
 * import-level error, not N identical row errors.
 */

export const UNREGISTERED_BRANCH_ERROR_RE = /is not registered/i;

export function unregisteredBranchMessage(name: string): string {
  return `Branch "${name}" is not registered. Add it on Organization first, or leave Branch blank for Unassigned.`;
}

export function normalizeBranchKey(name: string | undefined | null): string {
  return (name ?? "").trim().toLowerCase();
}

export function findRegisteredBranch(
  name: string | undefined | null,
  registered: string[],
): string | undefined {
  const key = normalizeBranchKey(name);
  if (!key) return undefined;
  return registered.find((b) => normalizeBranchKey(b) === key);
}

/** Blank → ""; registered match → org casing; otherwise keep first-seen CSV casing. */
export function canonicalizeBranch(
  name: string | undefined | null,
  registered: string[],
): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "";
  return findRegisteredBranch(trimmed, registered) ?? trimmed;
}

export function collectUnknownBranches(
  branchValues: Array<string | undefined | null>,
  registered: string[],
): string[] {
  const seen = new Set<string>();
  const unknown: string[] = [];
  for (const raw of branchValues) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) continue;
    const key = normalizeBranchKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!findRegisteredBranch(trimmed, registered)) unknown.push(trimmed);
  }
  return unknown;
}

export function stripUnregisteredBranchErrors(errors: string[]): string[] {
  return errors.filter((e) => !UNREGISTERED_BRANCH_ERROR_RE.test(e));
}

export function applyCsvBranches<T extends { data: { branch?: string }; errors: string[] }>(
  rows: T[],
  registered: string[],
): { rows: T[]; unknownBranches: string[] } {
  const unknownBranches = collectUnknownBranches(
    rows.map((r) => r.data.branch),
    registered,
  );
  return {
    unknownBranches,
    rows: rows.map((row) => ({
      ...row,
      data: { ...row.data, branch: canonicalizeBranch(row.data.branch, registered) },
      errors: stripUnregisteredBranchErrors(row.errors),
    })),
  };
}

export type OrgBranchRef = { id: string; name: string };

export type BranchEnsureResponse = {
  status: number;
  error?: string;
  code?: string;
  items?: { id?: string; name: string }[];
  item?: { id?: string; name: string };
};

export type BranchEnsureDeps = {
  list: () => Promise<BranchEnsureResponse>;
  create: (name: string) => Promise<BranchEnsureResponse>;
};

export function isFatalBranchEnsureFailure(res: BranchEnsureResponse): boolean {
  if (res.status >= 200 && res.status < 300) return false;
  if (res.status === 409) return false;
  const err = (res.error ?? "").toLowerCase();
  const code = (res.code ?? "").toUpperCase();
  if (code === "DEMO_READONLY") return true;
  if (res.status === 401) return true;
  if (/company not found/.test(err)) return true;
  if (/read-only demo|demo/.test(err) && res.status === 403) return true;
  if (res.status === 403 && /upgrade required/.test(err)) return false;
  if (res.status === 403) return true;
  if (res.status >= 500) return true;
  return false;
}

export function fatalBranchEnsureError(unknownNames: string[], apiError?: string): string {
  const label =
    unknownNames.length === 1
      ? `branch "${unknownNames[0]}"`
      : unknownNames.length > 1
        ? `branches ${unknownNames.map((n) => `"${n}"`).join(", ")}`
        : "new branches";
  if (apiError?.trim()) return `Could not register ${label}: ${apiError.trim()}`;
  return `Could not register ${label} for this import.`;
}

export type BranchEnsureResult =
  | { ok: true; registered: string[]; branches: OrgBranchRef[]; created: string[] }
  | { ok: false; error: string };

function itemsToBranchRefs(items?: { id?: string; name: string }[]): OrgBranchRef[] {
  const refs: OrgBranchRef[] = [];
  for (const item of items ?? []) {
    const name = (item?.name ?? "").trim();
    const id = (item?.id ?? "").trim();
    if (!name || !id) continue;
    if (refs.some((r) => r.id === id)) continue;
    refs.push({ id, name });
  }
  return refs;
}

function mergeBranchRefs(into: OrgBranchRef[], extra: OrgBranchRef[]): OrgBranchRef[] {
  const out = [...into];
  for (const ref of extra) {
    if (!out.some((r) => r.id === ref.id)) out.push(ref);
  }
  return out;
}

/** Attach Branch IDs after ensureOrgBranchesForImport. Blank → Unassigned (null id). */
export function applyEnsuredBranch<T extends { branch?: string; branchId?: string | null }>(
  data: T,
  result: Extract<BranchEnsureResult, { ok: true }>,
): T & { branch: string; branchId: string | null } {
  const name = canonicalizeBranch(data.branch, result.registered);
  const key = normalizeBranchKey(name);
  if (!key) return { ...data, branch: "", branchId: null };
  const found = result.branches.find((b) => normalizeBranchKey(b.name) === key);
  return {
    ...data,
    branch: found?.name ?? name,
    branchId: found?.id ?? null,
  };
}

/**
 * Load the company branch registry and POST any CSV names that are not present
 * (case-insensitive). Unsafe failures (no company, demo) return one error.
 */
export async function ensureOrgBranchesForImport(
  csvBranches: Array<string | undefined | null>,
  deps: BranchEnsureDeps,
): Promise<BranchEnsureResult> {
  const named = csvBranches.filter((b) => (b ?? "").trim());
  if (named.length === 0) return { ok: true, registered: [], branches: [], created: [] };

  const list = await deps.list();
  if (isFatalBranchEnsureFailure(list)) {
    const unknown = collectUnknownBranches(csvBranches, []);
    return { ok: false, error: fatalBranchEnsureError(unknown, list.error) };
  }

  const registered = (list.items ?? []).map((i) => i.name).filter(Boolean);
  let branches = itemsToBranchRefs(list.items);
  const toCreate = collectUnknownBranches(csvBranches, registered);
  const created: string[] = [];

  for (const name of toCreate) {
    const res = await deps.create(name);
    if (res.status === 409 || (res.status >= 200 && res.status < 300)) {
      const saved = res.item?.name?.trim() || name;
      created.push(saved);
      if (!findRegisteredBranch(saved, registered)) registered.push(saved);
      if (res.item?.id) {
        branches = mergeBranchRefs(branches, [{ id: res.item.id, name: saved }]);
      }
      continue;
    }
    if (isFatalBranchEnsureFailure(res)) {
      return { ok: false, error: fatalBranchEnsureError([name], res.error) };
    }
    // Non-fatal (e.g. upgrade required): keep the CSV name on the employee row.
    if (!findRegisteredBranch(name, registered)) registered.push(name);
  }

  if (toCreate.length > 0) {
    const refresh = await deps.list();
    if (!isFatalBranchEnsureFailure(refresh)) {
      branches = mergeBranchRefs(branches, itemsToBranchRefs(refresh.items));
      for (const item of refresh.items ?? []) {
        if (item?.name && !findRegisteredBranch(item.name, registered)) registered.push(item.name);
      }
    }
  }

  return { ok: true, registered, branches, created };
}

export function createOrgBranchApi(fetchFn: typeof fetch = fetch): BranchEnsureDeps {
  return {
    async list() {
      const res = await fetchFn("/api/org/units?kind=branches");
      const data = (await res.json().catch(() => ({}))) as BranchEnsureResponse & {
        items?: { name: string }[];
      };
      return {
        status: res.status,
        error: data.error,
        code: data.code,
        items: data.items,
      };
    },
    async create(name: string) {
      const res = await fetchFn("/api/org/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "branches", name }),
      });
      const data = (await res.json().catch(() => ({}))) as BranchEnsureResponse;
      return {
        status: res.status,
        error: data.error,
        code: data.code,
        item: data.item,
      };
    },
  };
}
