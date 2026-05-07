import type { DayKey } from "./time";

/**
 * Composite owner key for a convergence, used as the `ownerId` for
 * comments and any other resource that pins to the convergence
 * identity rather than the (lazily-created) `meetups` row id. Must
 * stay byte-for-byte identical to the server-side equivalent in
 * `convex/comments.ts`.
 */
export function convergenceOwnerId(parts: {
  day: DayKey;
  windowStartMs: number;
  windowEndMs: number;
  destinationStage: string;
}): string {
  return `${parts.day}|${parts.windowStartMs}|${parts.windowEndMs}|${parts.destinationStage}`;
}
