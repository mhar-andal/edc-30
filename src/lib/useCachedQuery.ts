import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import {
  getFunctionName,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server";
import { loadCached, makeCacheKey, saveCached } from "./offlineCache";

type QueryRef = FunctionReference<"query">;

/**
 * Pull a stable string identifier out of a Convex query reference so
 * we can scope the IDB cache key per-query.
 *
 * IMPORTANT: `api.foo.bar` is a Convex `anyApi` Proxy. Property
 * accesses like `query._name` return *another* Proxy rather than a
 * string, and `JSON.stringify(query)` collapses the Proxy down to
 * `"{}"` because the underlying target is empty. If we used either
 * of those, every cached query with the same args would collide on
 * the same IDB key — letting (for example) a `number` returned by
 * one query clobber an `Array` returned by another. Convex exposes
 * `getFunctionName` exactly for this purpose; it walks the Proxy
 * via the internal `functionName` symbol and returns the canonical
 * `"module:function"` string.
 */
function getQueryName(query: QueryRef): string {
  try {
    return getFunctionName(query);
  } catch {
    // The fallback covers exotic refs (mocks, mid-test stubs, etc.).
    // It still scopes by reference identity so different queries
    // never share a cache slot, even if they happen to have the
    // same args object.
    return `unnamed:${(query as unknown as { _id?: string })._id ?? Math.random()}`;
  }
}

export function useCachedQuery<Q extends QueryRef>(
  query: Q,
  args: Q["_args"] | "skip" = {} as Q["_args"],
): FunctionReturnType<Q> | undefined {
  const live = useQuery(query, args as Q["_args"]);
  const [cached, setCached] = useState<FunctionReturnType<Q> | undefined>(
    undefined,
  );
  const cacheKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (args === "skip") {
      cacheKeyRef.current = null;
      setCached(undefined);
      return;
    }
    const key = makeCacheKey(getQueryName(query), args);
    cacheKeyRef.current = key;
    let cancelled = false;
    void loadCached<FunctionReturnType<Q>>(key).then((value) => {
      if (!cancelled && value !== undefined) {
        setCached((prev) => (prev === undefined ? value : prev));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query, JSON.stringify(args)]);

  useEffect(() => {
    if (live === undefined) return;
    if (cacheKeyRef.current) {
      void saveCached(cacheKeyRef.current, live);
    }
  }, [live]);

  return live ?? cached;
}
