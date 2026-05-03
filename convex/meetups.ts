import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const dayValidator = v.union(
  v.literal("day_1"),
  v.literal("day_2"),
  v.literal("day_3"),
);

function sortPair(
  a: Id<"members">,
  b: Id<"members">,
): { memberAId: Id<"members">; memberBId: Id<"members"> } {
  return a < b ? { memberAId: a, memberBId: b } : { memberAId: b, memberBId: a };
}

export const listForDay = query({
  args: { day: dayValidator },
  handler: async (ctx, { day }) => {
    return await ctx.db
      .query("meetups")
      .withIndex("by_day", (q) => q.eq("day", day))
      .collect();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("meetups").collect();
  },
});

/**
 * Returns the list of distinct meetup labels users have ever used,
 * sorted by frequency (most-used first). The default landmark is always
 * surfaced first by the UI even when the table is empty.
 */
export const listLabels = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("meetups").collect();
    const counts = new Map<string, number>();
    for (const m of all) {
      const label = m.label?.trim();
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count }));
  },
});

export const upsert = mutation({
  args: {
    day: dayValidator,
    windowStartMs: v.number(),
    windowEndMs: v.number(),
    memberAId: v.id("members"),
    memberBId: v.id("members"),
    label: v.optional(v.string()),
    meetupStartMs: v.optional(v.number()),
    meetupEndMs: v.optional(v.number()),
    editedByMemberId: v.id("members"),
  },
  handler: async (
    ctx,
    {
      day,
      windowStartMs,
      windowEndMs,
      memberAId,
      memberBId,
      label,
      meetupStartMs,
      meetupEndMs,
      editedByMemberId,
    },
  ) => {
    if (memberAId === memberBId) {
      throw new Error("Cannot create a meetup with a single member.");
    }
    const trimmed = label?.trim() || undefined;
    const pair = sortPair(memberAId, memberBId);
    const existing = await ctx.db
      .query("meetups")
      .withIndex("by_window_pair", (q) =>
        q
          .eq("day", day)
          .eq("windowStartMs", windowStartMs)
          .eq("windowEndMs", windowEndMs)
          .eq("memberAId", pair.memberAId)
          .eq("memberBId", pair.memberBId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        label: trimmed,
        meetupStartMs,
        meetupEndMs,
        editedByMemberId,
        editedAt: Date.now(),
      });
      return existing._id;
    }
    return await ctx.db.insert("meetups", {
      day,
      windowStartMs,
      windowEndMs,
      memberAId: pair.memberAId,
      memberBId: pair.memberBId,
      label: trimmed,
      meetupStartMs,
      meetupEndMs,
      editedByMemberId,
      editedAt: Date.now(),
    });
  },
});

export const clear = mutation({
  args: {
    day: dayValidator,
    windowStartMs: v.number(),
    windowEndMs: v.number(),
    memberAId: v.id("members"),
    memberBId: v.id("members"),
  },
  handler: async (ctx, { day, windowStartMs, windowEndMs, memberAId, memberBId }) => {
    const pair = sortPair(memberAId, memberBId);
    const existing = await ctx.db
      .query("meetups")
      .withIndex("by_window_pair", (q) =>
        q
          .eq("day", day)
          .eq("windowStartMs", windowStartMs)
          .eq("windowEndMs", windowEndMs)
          .eq("memberAId", pair.memberAId)
          .eq("memberBId", pair.memberBId),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
