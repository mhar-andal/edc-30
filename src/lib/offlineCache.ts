import {
  clear as idbClear,
  get as idbGet,
  set as idbSet,
  createStore,
} from "idb-keyval";

const store = createStore("edc-offline-cache", "queries");
const BUILD_ID_KEY = "edc.cache.build-id";

/**
 * One-shot promise that wipes the IDB query cache when the bundle's
 * `__BUILD_ID__` differs from the one we last saw. This prevents
 * "app doesn't load after deploy" symptoms caused by IDB rows whose
 * shape no longer matches the new client code (e.g. references to
 * deleted entity IDs, new required fields, removed fields).
 *
 * Initialized lazily on first cache access; subsequent calls reuse
 * the same promise.
 */
let initPromise: Promise<void> | null = null;
function ensureFreshCache(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(BUILD_ID_KEY);
      if (stored !== __BUILD_ID__) {
        try {
          await idbClear(store);
        } catch {
          /* ignore — IDB unavailable / private browsing */
        }
        try {
          window.localStorage.setItem(BUILD_ID_KEY, __BUILD_ID__);
        } catch {
          /* ignore quota errors */
        }
      }
    } catch {
      /* ignore */
    }
  })();
  return initPromise;
}

export async function loadCached<T>(key: string): Promise<T | undefined> {
  await ensureFreshCache();
  try {
    return (await idbGet(key, store)) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function saveCached<T>(key: string, value: T): Promise<void> {
  await ensureFreshCache();
  try {
    await idbSet(key, value, store);
  } catch {
    /* ignore quota / private mode errors */
  }
}

export function makeCacheKey(name: string, args: unknown): string {
  return `${name}:${stableStringify(args)}`;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sortedKeys = Object.keys(v as Record<string, unknown>).sort();
      const out: Record<string, unknown> = {};
      for (const k of sortedKeys) out[k] = (v as Record<string, unknown>)[k];
      return out;
    }
    return v;
  });
}
