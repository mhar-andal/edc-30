import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const dayValidator = v.union(
  v.literal("day_1"),
  v.literal("day_2"),
  v.literal("day_3"),
);

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
 * Distinct meet-spot labels in use, sorted by frequency.
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

/**
 * Set or clear the meet-spot label for a convergence. Anyone may
 * call this. Passing `label: undefined` (or an empty string) clears
 * the label; if that leaves the row with neither a label nor a meet
 * time, the row is deleted.
 */
export const setSpot = mutation({
  args: {
    day: dayValidator,
    windowStartMs: v.number(),
    windowEndMs: v.number(),
    destinationStage: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { day, windowStartMs, windowEndMs, destinationStage, label },
  ) => {
    const trimmed = label?.trim() || undefined;
    const existing = await ctx.db
      .query("meetups")
      .withIndex("by_window_stage", (q) =>
        q
          .eq("day", day)
          .eq("windowStartMs", windowStartMs)
          .eq("windowEndMs", windowEndMs)
          .eq("destinationStage", destinationStage),
      )
      .first();

    if (existing) {
      if (!trimmed && existing.meetMs === undefined) {
        await ctx.db.delete(existing._id);
        return;
      }
      await ctx.db.patch(existing._id, {
        label: trimmed,
        editedAt: Date.now(),
      });
      return existing._id;
    }
    if (!trimmed) return;
    return await ctx.db.insert("meetups", {
      day,
      windowStartMs,
      windowEndMs,
      destinationStage,
      label: trimmed,
      editedAt: Date.now(),
    });
  },
});

/**
 * Set or clear the agreed meeting moment for a convergence. The
 * value is clamped to `[windowStartMs, windowEndMs]` defensively.
 * If clearing leaves the row empty, it is deleted.
 */
export const setMeetTime = mutation({
  args: {
    day: dayValidator,
    windowStartMs: v.number(),
    windowEndMs: v.number(),
    destinationStage: v.string(),
    meetMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { day, windowStartMs, windowEndMs, destinationStage, meetMs },
  ) => {
    const clamped =
      meetMs === undefined
        ? undefined
        : Math.min(Math.max(meetMs, windowStartMs), windowEndMs);
    const existing = await ctx.db
      .query("meetups")
      .withIndex("by_window_stage", (q) =>
        q
          .eq("day", day)
          .eq("windowStartMs", windowStartMs)
          .eq("windowEndMs", windowEndMs)
          .eq("destinationStage", destinationStage),
      )
      .first();

    if (existing) {
      const remainingLabel = existing.label?.trim();
      if (clamped === undefined && !remainingLabel) {
        await ctx.db.delete(existing._id);
        return;
      }
      await ctx.db.patch(existing._id, {
        meetMs: clamped,
        editedAt: Date.now(),
      });
      return existing._id;
    }
    if (clamped === undefined) return;
    return await ctx.db.insert("meetups", {
      day,
      windowStartMs,
      windowEndMs,
      destinationStage,
      meetMs: clamped,
      editedAt: Date.now(),
    });
  },
});

/**
 * Hard-clear the entire meetup row (drops both label and meet time).
 */
export const clear = mutation({
  args: {
    day: dayValidator,
    windowStartMs: v.number(),
    windowEndMs: v.number(),
    destinationStage: v.string(),
  },
  handler: async (
    ctx,
    { day, windowStartMs, windowEndMs, destinationStage },
  ) => {
    const existing = await ctx.db
      .query("meetups")
      .withIndex("by_window_stage", (q) =>
        q
          .eq("day", day)
          .eq("windowStartMs", windowStartMs)
          .eq("windowEndMs", windowEndMs)
          .eq("destinationStage", destinationStage),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
