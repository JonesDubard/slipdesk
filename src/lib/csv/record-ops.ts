export interface DeleteByIdResult<T> {
  remaining: T[];
  deleted: T[];
  missing: string[];
}

/** Remove records by id. Missing ids are reported, never invent rows, never shift other ids. */
export function deleteByIds<T extends { id: string }>(
  records: T[],
  ids: string[],
): DeleteByIdResult<T> {
  const want = new Set(ids);
  const remaining: T[] = [];
  const deleted: T[] = [];
  const found = new Set<string>();

  for (const rec of records) {
    if (want.has(rec.id)) {
      deleted.push(rec);
      found.add(rec.id);
    } else {
      remaining.push(rec);
    }
  }

  return {
    remaining,
    deleted,
    missing: ids.filter((id) => !found.has(id)),
  };
}

export interface DeleteAtIndexResult<T> {
  remaining: T[];
  deleted: T[];
  invalid: number[];
}

/** Remove preview rows by index. Invalid indexes are reported; remaining rows keep relative order. */
export function deleteAtIndexes<T>(rows: T[], indexes: number[]): DeleteAtIndexResult<T> {
  const unique = [...new Set(indexes)];
  const invalid = unique.filter((i) => !Number.isInteger(i) || i < 0 || i >= rows.length);
  const drop = new Set(unique.filter((i) => i >= 0 && i < rows.length));
  const remaining: T[] = [];
  const deleted: T[] = [];
  rows.forEach((row, i) => {
    if (drop.has(i)) deleted.push(row);
    else remaining.push(row);
  });
  return { remaining, deleted, invalid };
}
