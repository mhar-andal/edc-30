import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const dayValidator = v.union(
  v.literal("day_1"),
  v.literal("day_2"),
  v.literal("day_3"),
);

const TITLE_MAX = 80;
const LOCATION_MAX = 80;
const NOTES_MAX = 500;

/**
 * Festival-day windows in UTC ms (must stay in sync with
 * src/lib/time.ts FESTIVAL_DAY_RANGE_MS). Keeping the constants
 * server-side too lets us validate sidequest start/end without
 * trusting the client.
 */
const DAY_RANGE_MS: Record<
  "day_1" | "day_2" | "day_3",
  { start: number; end: number }
> = {
  day_1: { start: Date.UTC(2026, 4, 16, 0, 0), end: Date.UTC(2026, 4, 16, 12, 30) },
  day_2: { start: Date.UTC(2026, 4, 17, 0, 0), end: Date.UTC(2026, 4, 17, 12, 30) },
  day_3: { start: Date.UTC(2026, 4, 18, 0, 0), end: Date.UTC(2026, 4, 18, 12, 30) },
};

function normalizeAndValidate(args: {
  day: "day_1" | "day_2" | "day_3";
  title: string;
  location?: string;
  notes?: string;
  startMs: number;
  endMs: number;
}) {
  const title = args.title.trim();
  if (title.length === 0) throw new Error("Title cannot be empty.");
  if (title.length > TITLE_MAX)
    throw new Error(`Title is too long (max ${TITLE_MAX}).`);

  const location = args.location?.trim() || undefined;
  if (location && location.length > LOCATION_MAX)
    throw new Error(`Location is too long (max ${LOCATION_MAX}).`);

  const notes = args.notes?.trim() || undefined;
  if (notes && notes.length > NOTES_MAX)
    throw new Error(`Notes are too long (max ${NOTES_MAX}).`);

  if (!Number.isFinite(args.startMs) || !Number.isFinite(args.endMs)) {
    throw new Error("Start and end must be valid timestamps.");
  }
  if (args.endMs <= args.startMs) {
    throw new Error("End time must be after start time.");
  }

  const range = DAY_RANGE_MS[args.day];
  if (args.startMs < range.start || args.endMs > range.end) {
    throw new Error("Sidequest must fit within the festival day.");
  }

  return { title, location, notes };
}

/**
 * Aggregate every distinct location label across all sidequests with
 * a usage count. Used by `SpotPicker` to surface previously-used
 * spots as quick-pick chips alongside the convergence labels and the
 * built-in defaults.
 */
export const listLabels = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("sidequests").collect();
    const counts = new Map<string, number>();
    for (const s of all) {
      const label = s.location?.trim();
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count }));
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const sidequests = await ctx.db.query("sidequests").collect();
    sidequests.sort((a, b) => a.startMs - b.startMs);
    const allParticipants = await ctx.db
      .query("sidequestParticipants")
      .collect();

    const byQuest = new Map<string, Array<Id<"members">>>();
    for (const p of allParticipants) {
      const arr = byQuest.get(p.sidequestId) ?? [];
      arr.push(p.memberId);
      byQuest.set(p.sidequestId, arr);
    }

    return sidequests.map((q) => ({
      ...q,
      participantMemberIds: byQuest.get(q._id) ?? [],
    }));
  },
});

export const listForDay = query({
  args: { day: dayValidator },
  handler: async (ctx, { day }) => {
    const sidequests = await ctx.db
      .query("sidequests")
      .withIndex("by_day_start", (q) => q.eq("day", day))
      .collect();

    const result: Array<
      Doc<"sidequests"> & { participantMemberIds: Array<Id<"members">> }
    > = [];
    for (const s of sidequests) {
      const ps = await ctx.db
        .query("sidequestParticipants")
        .withIndex("by_sidequest", (q) => q.eq("sidequestId", s._id))
        .collect();
      result.push({
        ...s,
        participantMemberIds: ps.map((p) => p.memberId),
      });
    }
    return result;
  },
});

export const create = mutation({
  args: {
    memberId: v.id("members"),
    day: dayValidator,
    title: v.string(),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    startMs: v.number(),
    endMs: v.number(),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) throw new Error("Member not found.");

    const { title, location, notes } = normalizeAndValidate(args);

    const now = Date.now();
    const sidequestId = await ctx.db.insert("sidequests", {
      day: args.day,
      title,
      location,
      notes,
      startMs: args.startMs,
      endMs: args.endMs,
      createdByMemberId: args.memberId,
      createdAt: now,
      editedAt: now,
    });

    // Auto-join the creator so they show up in the participant list.
    await ctx.db.insert("sidequestParticipants", {
      sidequestId,
      memberId: args.memberId,
      joinedAt: now,
    });

    return sidequestId;
  },
});

export const update = mutation({
  args: {
    sidequestId: v.id("sidequests"),
    memberId: v.id("members"),
    title: v.string(),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    startMs: v.number(),
    endMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.sidequestId);
    if (!existing) throw new Error("Sidequest not found.");
    if (existing.createdByMemberId !== args.memberId) {
      throw new Error("Only the creator can edit this sidequest.");
    }

    const { title, location, notes } = normalizeAndValidate({
      day: existing.day,
      title: args.title,
      location: args.location,
      notes: args.notes,
      startMs: args.startMs,
      endMs: args.endMs,
    });

    await ctx.db.patch(args.sidequestId, {
      title,
      location,
      notes,
      startMs: args.startMs,
      endMs: args.endMs,
      editedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    sidequestId: v.id("sidequests"),
    memberId: v.id("members"),
  },
  handler: async (ctx, { sidequestId, memberId }) => {
    const existing = await ctx.db.get(sidequestId);
    if (!existing) return;
    if (existing.createdByMemberId !== memberId) {
      throw new Error("Only the creator can delete this sidequest.");
    }

    const ps = await ctx.db
      .query("sidequestParticipants")
      .withIndex("by_sidequest", (q) => q.eq("sidequestId", sidequestId))
      .collect();
    for (const p of ps) await ctx.db.delete(p._id);

    // Cascade: delete any comments attached to this sidequest. Convergence
    // comments live by composite key and are unaffected.
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_owner", (q) =>
        q.eq("ownerType", "sidequest").eq("ownerId", sidequestId),
      )
      .collect();
    for (const c of comments) await ctx.db.delete(c._id);

    await ctx.db.delete(sidequestId);
  },
});

export const join = mutation({
  args: {
    sidequestId: v.id("sidequests"),
    memberId: v.id("members"),
  },
  handler: async (ctx, { sidequestId, memberId }) => {
    const sidequest = await ctx.db.get(sidequestId);
    if (!sidequest) throw new Error("Sidequest not found.");
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Member not found.");

    const existing = await ctx.db
      .query("sidequestParticipants")
      .withIndex("by_sidequest_member", (q) =>
        q.eq("sidequestId", sidequestId).eq("memberId", memberId),
      )
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("sidequestParticipants", {
      sidequestId,
      memberId,
      joinedAt: Date.now(),
    });
  },
});

export const leave = mutation({
  args: {
    sidequestId: v.id("sidequests"),
    memberId: v.id("members"),
  },
  handler: async (ctx, { sidequestId, memberId }) => {
    const sidequest = await ctx.db.get(sidequestId);
    if (!sidequest) return;
    if (sidequest.createdByMemberId === memberId) {
      // The creator can't leave — they'd orphan the event. They must
      // delete it instead via `remove`.
      throw new Error("Creator can't leave their own sidequest. Delete it instead.");
    }

    const existing = await ctx.db
      .query("sidequestParticipants")
      .withIndex("by_sidequest_member", (q) =>
        q.eq("sidequestId", sidequestId).eq("memberId", memberId),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
