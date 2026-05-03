import { get as idbGet, set as idbSet, createStore } from "idb-keyval";

const store = createStore("edc-offline-cache", "queries");

export async function loadCached<T>(key: string): Promise<T | undefined> {
  try {
    return (await idbGet(key, store)) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function saveCached<T>(key: string, value: T): Promise<void> {
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
