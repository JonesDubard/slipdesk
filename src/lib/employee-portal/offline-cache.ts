/**
 * Offline-ready cache for the last 3 viewed payslips.
 * Primary: IndexedDB (larger payloads / PDF blobs later).
 * Fallback: localStorage when IDB is unavailable.
 */

import type { EmployeePayslip } from "./payslips";

const STORAGE_PREFIX = "slipdesk.portal.payslips.";
const IDB_NAME = "slipdesk-portal";
const IDB_VERSION = 1;
const IDB_STORE = "payslips";
export const MAX_CACHED_PAYSLIPS = 3;

export type CachedPayslipBundle = {
  employeeId: string;
  cachedAt: string;
  payslips: EmployeePayslip[];
  /** Optional base64 / blob refs for future PDF offline viewing */
  pdfBlobs?: Record<string, string>;
};

function storageKey(employeeId: string): string {
  return `${STORAGE_PREFIX}${employeeId}`;
}

function emptyBundle(employeeId: string): CachedPayslipBundle {
  return { employeeId, cachedAt: "", payslips: [] };
}

function readLocalStore(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "employeeId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(employeeId: string): Promise<CachedPayslipBundle | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(employeeId);
      req.onsuccess = () => {
        const val = req.result as CachedPayslipBundle | undefined;
        resolve(val && val.employeeId === employeeId ? val : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(bundle: CachedPayslipBundle): Promise<boolean> {
  const db = await openIdb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(bundle);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function idbDelete(employeeId: string): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(employeeId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function loadFromLocalStorage(employeeId: string): CachedPayslipBundle {
  const empty = emptyBundle(employeeId);
  const store = readLocalStore();
  if (!store) return empty;
  try {
    const raw = store.getItem(storageKey(employeeId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as CachedPayslipBundle;
    if (!parsed || parsed.employeeId !== employeeId || !Array.isArray(parsed.payslips)) {
      return empty;
    }
    return {
      employeeId,
      cachedAt: parsed.cachedAt ?? "",
      payslips: parsed.payslips.slice(0, MAX_CACHED_PAYSLIPS),
      pdfBlobs: parsed.pdfBlobs,
    };
  } catch {
    return empty;
  }
}

function saveToLocalStorage(bundle: CachedPayslipBundle): void {
  const store = readLocalStore();
  if (!store) return;
  try {
    store.setItem(storageKey(bundle.employeeId), JSON.stringify(bundle));
  } catch {
    // Quota / private mode
  }
}

/** Async load — prefers IndexedDB, falls back to localStorage. */
export async function loadCachedPayslipsAsync(employeeId: string): Promise<CachedPayslipBundle> {
  if (!employeeId) return emptyBundle("");
  const fromIdb = await idbGet(employeeId);
  if (fromIdb?.payslips?.length) {
    return {
      ...fromIdb,
      payslips: fromIdb.payslips.slice(0, MAX_CACHED_PAYSLIPS),
    };
  }
  return loadFromLocalStorage(employeeId);
}

/** Sync helper kept for tests / SSR-safe reads (localStorage only). */
export function loadCachedPayslips(employeeId: string): CachedPayslipBundle {
  return loadFromLocalStorage(employeeId);
}

/** Persist a viewed payslip; keeps only the most recent MAX_CACHED_PAYSLIPS. */
export async function cacheViewedPayslipAsync(
  employeeId: string,
  payslip: EmployeePayslip,
  pdfBase64?: string,
): Promise<CachedPayslipBundle> {
  const existing = await loadCachedPayslipsAsync(employeeId);
  const without = existing.payslips.filter((p) => p.id !== payslip.id);
  const payslips = [payslip, ...without].slice(0, MAX_CACHED_PAYSLIPS);
  const pdfBlobs = { ...(existing.pdfBlobs ?? {}) };
  if (pdfBase64) pdfBlobs[payslip.id] = pdfBase64;
  // Drop blobs for payslips no longer cached
  const keep = new Set(payslips.map((p) => p.id));
  for (const key of Object.keys(pdfBlobs)) {
    if (!keep.has(key)) delete pdfBlobs[key];
  }
  const bundle: CachedPayslipBundle = {
    employeeId,
    cachedAt: new Date().toISOString(),
    payslips,
    pdfBlobs: Object.keys(pdfBlobs).length ? pdfBlobs : undefined,
  };
  const idbOk = await idbPut(bundle);
  if (!idbOk) saveToLocalStorage(bundle);
  else saveToLocalStorage(bundle); // mirror for sync readers
  return bundle;
}

/** Sync write — localStorage only (also used when IDB unavailable). */
export function cacheViewedPayslip(employeeId: string, payslip: EmployeePayslip): CachedPayslipBundle {
  const existing = loadCachedPayslips(employeeId);
  const payslips = mergePayslipCache(existing.payslips, payslip);
  const bundle: CachedPayslipBundle = {
    employeeId,
    cachedAt: new Date().toISOString(),
    payslips,
  };
  saveToLocalStorage(bundle);
  void idbPut(bundle);
  return bundle;
}

export async function getCachedPayslipAsync(
  employeeId: string,
  payslipId: string,
): Promise<EmployeePayslip | null> {
  const bundle = await loadCachedPayslipsAsync(employeeId);
  return bundle.payslips.find((p) => p.id === payslipId) ?? null;
}

export function getCachedPayslip(employeeId: string, payslipId: string): EmployeePayslip | null {
  return loadCachedPayslips(employeeId).payslips.find((p) => p.id === payslipId) ?? null;
}

export async function clearCachedPayslipsAsync(employeeId: string): Promise<void> {
  await idbDelete(employeeId);
  const store = readLocalStore();
  if (!store) return;
  try {
    store.removeItem(storageKey(employeeId));
  } catch {
    // ignore
  }
}

export function clearCachedPayslips(employeeId: string): void {
  void clearCachedPayslipsAsync(employeeId);
}

/** Pure helper for tests — merge without touching storage. */
export function mergePayslipCache(
  existing: EmployeePayslip[],
  payslip: EmployeePayslip,
  max = MAX_CACHED_PAYSLIPS,
): EmployeePayslip[] {
  return [payslip, ...existing.filter((p) => p.id !== payslip.id)].slice(0, max);
}
