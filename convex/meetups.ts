import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { convergenceOwnerId, logActivity } from "./activity";

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
    actorMemberId: v.optional(v.id("members")),
  },
  handler: async (
    ctx,
    {
      day,
      windowStartMs,
      windowEndMs,
      destinationStage,
      label,
      actorMemberId,
    },
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

    const ownerId = convergenceOwnerId({
      day,
      windowStartMs,
      windowEndMs,
      destinationStage,
    });
    const fromLabel = existing?.label;

    if (existing) {
      if (
        !trimmed &&
        existing.meetMs === undefined &&
        existing.meetEndMs === undefined
      ) {
        await ctx.db.delete(existing._id);
        if (fromLabel) {
          await logActivity(ctx, {
            ownerType: "convergence",
            ownerId,
            actorMemberId,
            kind: "spot_changed",
            data: { fromLabel, toLabel: undefined },
          });
        }
        return;
      }
      await ctx.db.patch(existing._id, {
        label: trimmed,
        editedAt: Date.now(),
      });
      if (fromLabel !== trimmed) {
        await logActivity(ctx, {
          ownerType: "convergence",
          ownerId,
          actorMemberId,
          kind: "spot_changed",
          data: { fromLabel, toLabel: trimmed },
        });
      }
      return existing._id;
    }
    if (!trimmed) return;
    const inserted = await ctx.db.insert("meetups", {
      day,
      windowStartMs,
      windowEndMs,
      destinationStage,
      label: trimmed,
      editedAt: Date.now(),
    });
    await logActivity(ctx, {
      ownerType: "convergence",
      ownerId,
      actorMemberId,
      kind: "spot_changed",
      data: { fromLabel: undefined, toLabel: trimmed },
    });
    return inserted;
  },
});

/**
 * Set or clear the agreed meet window for a convergence. `meetMs`
 * is when the group gathers at the spot; `meetEndMs` is when they
 * leave for the destination. Both are optional. Values are clamped
 * to `[windowStartMs, windowEndMs]` defensively, and `meetEndMs`
 * cannot precede `meetMs`. If clearing leaves the row empty (no
 * label and no times), the row is deleted.
 */
export const setMeetTime = mutation({
  args: {
    day: dayValidator,
    windowStartMs: v.number(),
    windowEndMs: v.number(),
    destinationStage: v.string(),
    meetMs: v.optional(v.number()),
    meetEndMs: v.optional(v.number()),
    actorMemberId: v.optional(v.id("members")),
  },
  handler: async (
    ctx,
    {
      day,
      windowStartMs,
      windowEndMs,
      destinationStage,
      meetMs,
      meetEndMs,
      actorMemberId,
    },
  ) => {
    const clampedStart =
      meetMs === undefined
        ? undefined
        : Math.min(Math.max(meetMs, windowStartMs), windowEndMs);
    // An end without a start doesn't make sense — drop it.
    const clampedEnd =
      meetEndMs === undefined || clampedStart === undefined
        ? undefined
        : Math.min(Math.max(meetEndMs, clampedStart), windowEndMs);

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

    const ownerId = convergenceOwnerId({
      day,
      windowStartMs,
      windowEndMs,
      destinationStage,
    });
    const fromMeetMs = existing?.meetMs;
    const fromMeetEndMs = existing?.meetEndMs;
    const timeChanged =
      fromMeetMs !== clampedStart || fromMeetEndMs !== clampedEnd;

    if (existing) {
      const remainingLabel = existing.label?.trim();
      if (
        clampedStart === undefined &&
        clampedEnd === undefined &&
        !remainingLabel
      ) {
        await ctx.db.delete(existing._id);
        if (fromMeetMs !== undefined || fromMeetEndMs !== undefined) {
          await logActivity(ctx, {
            ownerType: "convergence",
            ownerId,
            actorMemberId,
            kind: "time_changed",
            data: {
              fromMeetMs,
              toMeetMs: undefined,
              fromMeetEndMs,
              toMeetEndMs: undefined,
            },
          });
        }
        return;
      }
      await ctx.db.patch(existing._id, {
        meetMs: clampedStart,
        meetEndMs: clampedEnd,
        editedAt: Date.now(),
      });
      if (timeChanged) {
        await logActivity(ctx, {
          ownerType: "convergence",
          ownerId,
          actorMemberId,
          kind: "time_changed",
          data: {
            fromMeetMs,
            toMeetMs: clampedStart,
            fromMeetEndMs,
            toMeetEndMs: clampedEnd,
          },
        });
      }
      return existing._id;
    }
    if (clampedStart === undefined && clampedEnd === undefined) return;
    const inserted = await ctx.db.insert("meetups", {
      day,
      windowStartMs,
      windowEndMs,
      destinationStage,
      meetMs: clampedStart,
      meetEndMs: clampedEnd,
      editedAt: Date.now(),
    });
    await logActivity(ctx, {
      ownerType: "convergence",
      ownerId,
      actorMemberId,
      kind: "time_changed",
      data: {
        fromMeetMs: undefined,
        toMeetMs: clampedStart,
        fromMeetEndMs: undefined,
        toMeetEndMs: clampedEnd,
      },
    });
    return inserted;
  },
});

/**
 * Hard-clear the entire meetup row (drops label and meet time). The
 * label-bound map pin lives in the `spots` table and is intentionally
 * left alone here — pins are reused across convergences sharing the
 * same label, so we don't drop the pin just because one convergence
 * stopped using the spot.
 */
export const clear = mutation({
  args: {
    day: dayValidator,
    windowStartMs: v.number(),
    windowEndMs: v.number(),
    destinationStage: v.string(),
    actorMemberId: v.optional(v.id("members")),
  },
  handler: async (
    ctx,
    { day, windowStartMs, windowEndMs, destinationStage, actorMemberId },
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
    if (!existing) return;

    const ownerId = convergenceOwnerId({
      day,
      windowStartMs,
      windowEndMs,
      destinationStage,
    });
    const fromLabel = existing.label;
    const fromMeetMs = existing.meetMs;
    const fromMeetEndMs = existing.meetEndMs;

    await ctx.db.delete(existing._id);
    if (fromLabel) {
      await logActivity(ctx, {
        ownerType: "convergence",
        ownerId,
        actorMemberId,
        kind: "spot_changed",
        data: { fromLabel, toLabel: undefined },
      });
    }
    if (fromMeetMs !== undefined || fromMeetEndMs !== undefined) {
      await logActivity(ctx, {
        ownerType: "convergence",
        ownerId,
        actorMemberId,
        kind: "time_changed",
        data: {
          fromMeetMs,
          toMeetMs: undefined,
          fromMeetEndMs,
          toMeetEndMs: undefined,
        },
      });
    }
  },
});
