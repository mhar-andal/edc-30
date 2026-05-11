import type { Doc } from "../../convex/_generated/dataModel";

/**
 * Lookup key for a spot's display label. Mirrors the server-side
 * normalization in `convex/spots.ts` so client lookups against the
 * spots list use the same matching as the persistence layer.
 *
 * Keep this in sync with `convex/spots.ts > spotLabelKey`.
 */
export function spotLabelKey(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Build a label-keyed lookup over the spots list. Use this in
 * components that already pull `api.spots.list` to pre-fill or
 * preview pins for a given label.
 */
export function indexSpotsByLabel(
  spots: ReadonlyArray<Doc<"spots">>,
): Map<string, Doc<"spots">> {
  const out = new Map<string, Doc<"spots">>();
  for (const s of spots) out.set(s.labelKey, s);
  return out;
}

export type Spot = Doc<"spots">;
