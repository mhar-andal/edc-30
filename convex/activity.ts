import { v } from "convex/values";
import { query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const ownerTypeValidator = v.union(
  v.literal("sidequest"),
  v.literal("convergence"),
);

/**
 * The set of structural events recorded against a sidequest /
 * convergence. Mirrors the union in `schema.ts`.
 */
export type ActivityKind =
  | "created"
  | "spot_changed"
  | "time_changed"
  | "title_changed"
  | "location_changed"
  | "notes_changed"
  | "schedule_changed"
  | "joined"
  | "left";

/**
 * Common payload shape — all fields optional, populated based on the
 * event kind. Field names mirror the schema so the row write is a
 * direct passthrough.
 */
export interface ActivityData {
  fromLabel?: string;
  toLabel?: string;
  fromMeetMs?: number;
  toMeetMs?: number;
  fromMeetEndMs?: number;
  toMeetEndMs?: number;
  fromTitle?: string;
  toTitle?: string;
  fromLocation?: string;
  toLocation?: string;
  fromNotes?: string;
  toNotes?: string;
  fromStartMs?: number;
  toStartMs?: number;
  fromEndMs?: number;
  toEndMs?: number;
}

/**
 * Append a row to the activity log. Called from inside other
 * mutations — never via the public Convex API, since logging without
 * an underlying state change would be meaningless.
 *
 * Returns void (caller doesn't need the id).
 */
export async function logActivity(
  ctx: MutationCtx,
  args: {
    ownerType: "sidequest" | "convergence";
    ownerId: string;
    actorMemberId?: Id<"members">;
    kind: ActivityKind;
    data?: ActivityData;
  },
): Promise<void> {
  await ctx.db.insert("activity", {
    ownerType: args.ownerType,
    ownerId: args.ownerId,
    actorMemberId: args.actorMemberId,
    kind: args.kind,
    data: args.data,
    createdAt: Date.now(),
  });
}

/**
 * Convergence composite key, kept here too so callers that already
 * import `activity` don't need a second import. Mirrors the helper
 * in `comments.ts` and `src/lib/convergenceKey.ts`.
 */
export function convergenceOwnerId(parts: {
  day: "day_1" | "day_2" | "day_3";
  windowStartMs: number;
  windowEndMs: number;
  destinationStage: string;
}): string {
  return `${parts.day}|${parts.windowStartMs}|${parts.windowEndMs}|${parts.destinationStage}`;
}

/**
 * All activity entries for a single owner. Ordered newest → oldest
 * because the changelog UI shows recent changes first.
 */
export const listForOwner = query({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
  },
  handler: async (ctx, { ownerType, ownerId }) => {
    const rows = await ctx.db
      .query("activity")
      .withIndex("by_owner", (q) =>
        q.eq("ownerType", ownerType).eq("ownerId", ownerId),
      )
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows;
  },
});
