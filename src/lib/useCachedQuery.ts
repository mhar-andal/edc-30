import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { loadCached, makeCacheKey, saveCached } from "./offlineCache";

type QueryRef = FunctionReference<"query">;

function getQueryName(query: QueryRef): string {
  const name = (
    query as unknown as {
      _name?: string;
      _functionPath?: string;
      _functionId?: string;
    }
  )._name;
  if (typeof name === "string") return name;
  return JSON.stringify(query);
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
