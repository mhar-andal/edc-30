import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { mentionedMemberIdsFromBody } from "./mentions";

const ownerTypeValidator = v.union(
  v.literal("sidequest"),
  v.literal("convergence"),
);

const BODY_MAX = 1000;
const BODY_MIN = 1;

/**
 * Composite owner key for a convergence. Comments live independently
 * of the `meetups` row lifecycle (which only materializes once a
 * spot/time is set), so commenting on a convergence with no agreed
 * meet details still works.
 */
function convergenceOwnerId(parts: {
  day: "day_1" | "day_2" | "day_3";
  windowStartMs: number;
  windowEndMs: number;
  destinationStage: string;
}): string {
  return `${parts.day}|${parts.windowStartMs}|${parts.windowEndMs}|${parts.destinationStage}`;
}

export { convergenceOwnerId };

/**
 * All comments for a single owner (sidequest row, or convergence
 * composite key), sorted oldest → newest.
 */
export const listForOwner = query({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
  },
  handler: async (ctx, { ownerType, ownerId }) => {
    return await ctx.db
      .query("comments")
      .withIndex("by_owner", (q) =>
        q.eq("ownerType", ownerType).eq("ownerId", ownerId),
      )
      .collect();
  },
});

/**
 * Aggregate comment counts by owner key — used to badge sidequest
 * blocks and convergence cards without requiring each one to
 * subscribe individually.
 */
export const countsByOwner = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("comments").collect();
    const byKey = new Map<string, number>();
    for (const c of all) {
      const key = `${c.ownerType}:${c.ownerId}`;
      byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }
    return Array.from(byKey.entries()).map(([key, count]) => ({ key, count }));
  },
});

export const add = mutation({
  args: {
    ownerType: ownerTypeValidator,
    ownerId: v.string(),
    authorMemberId: v.id("members"),
    body: v.string(),
  },
  handler: async (ctx, { ownerType, ownerId, authorMemberId, body }) => {
    const author = await ctx.db.get(authorMemberId);
    if (!author) throw new Error("Author member not found.");

    const trimmed = body.trim();
    if (trimmed.length < BODY_MIN) throw new Error("Comment can't be empty.");
    if (trimmed.length > BODY_MAX)
      throw new Error(`Comment is too long (max ${BODY_MAX} chars).`);

    if (ownerType === "sidequest") {
      // Validate the sidequest exists. We allow comments from any
      // member (including non-participants) so people can chime in
      // before joining.
      const sq = await ctx.db.get(ownerId as Id<"sidequests">);
      if (!sq) throw new Error("Sidequest not found.");
    }
    // For convergences we don't validate against `meetups` because
    // the row may not exist yet. The composite key is a free-form
    // identifier — if the underlying convergence stops making sense
    // (e.g. selections change), the comment thread just sits unused.

    // Resolve mentions against the current member roster.
    const allMembers = await ctx.db.query("members").collect();
    const mentionedIds = mentionedMemberIdsFromBody(
      trimmed,
      allMembers.map((m) => ({ _id: m._id, name: m.name })),
    ) as Array<Id<"members">>;

    const now = Date.now();
    return await ctx.db.insert("comments", {
      ownerType,
      ownerId,
      authorMemberId,
      body: trimmed,
      mentionedMemberIds: mentionedIds,
      createdAt: now,
    });
  },
});

export const remove = mutation({
  args: {
    commentId: v.id("comments"),
    memberId: v.id("members"),
  },
  handler: async (ctx, { commentId, memberId }) => {
    const existing = await ctx.db.get(commentId);
    if (!existing) return;
    if (existing.authorMemberId !== memberId) {
      throw new Error("You can only delete your own comments.");
    }
    await ctx.db.delete(commentId);
  },
});
