import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("memberSelections").collect();
  },
});

export const listForMember = query({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    return await ctx.db
      .query("memberSelections")
      .withIndex("by_member", (q) => q.eq("memberId", memberId))
      .collect();
  },
});

export const toggle = mutation({
  args: {
    memberId: v.id("members"),
    artistId: v.id("artists"),
  },
  handler: async (ctx, { memberId, artistId }) => {
    const existing = await ctx.db
      .query("memberSelections")
      .withIndex("by_member_artist", (q) =>
        q.eq("memberId", memberId).eq("artistId", artistId),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { added: false };
    }
    await ctx.db.insert("memberSelections", {
      memberId,
      artistId,
      addedAt: Date.now(),
    });
    return { added: true };
  },
});

export const copyFromMember = mutation({
  args: {
    sourceMemberId: v.id("members"),
    targetMemberId: v.id("members"),
    mode: v.union(v.literal("replace"), v.literal("add")),
    /**
     * Optional day filter. When supplied, only picks for that day are
     * considered on both sides — source picks for other days are
     * ignored, and a "replace" only clears the target's picks for the
     * specified day.
     */
    day: v.optional(
      v.union(v.literal("day_1"), v.literal("day_2"), v.literal("day_3")),
    ),
  },
  handler: async (ctx, { sourceMemberId, targetMemberId, mode, day }) => {
    if (sourceMemberId === targetMemberId) {
      throw new Error("Cannot copy from yourself.");
    }
    const sourceMember = await ctx.db.get(sourceMemberId);
    const targetMember = await ctx.db.get(targetMemberId);
    if (!sourceMember || !targetMember) throw new Error("Member not found.");

    const sourceSels = await ctx.db
      .query("memberSelections")
      .withIndex("by_member", (q) => q.eq("memberId", sourceMemberId))
      .collect();
    const targetSels = await ctx.db
      .query("memberSelections")
      .withIndex("by_member", (q) => q.eq("memberId", targetMemberId))
      .collect();

    let dayArtistIds: Set<string> | null = null;
    if (day) {
      const dayArtists = await ctx.db
        .query("artists")
        .withIndex("by_day_start", (q) => q.eq("day", day))
        .collect();
      dayArtistIds = new Set(dayArtists.map((a) => a._id));
    }

    const filteredSourceSels = dayArtistIds
      ? sourceSels.filter((s) => dayArtistIds!.has(s.artistId))
      : sourceSels;
    const targetSelsToDelete = dayArtistIds
      ? targetSels.filter((s) => dayArtistIds!.has(s.artistId))
      : targetSels;
    const targetArtistIds = new Set(targetSels.map((s) => s.artistId));

    if (mode === "replace") {
      for (const s of targetSelsToDelete) {
        await ctx.db.delete(s._id);
        targetArtistIds.delete(s.artistId);
      }
    }

    let added = 0;
    let skipped = 0;
    for (const s of filteredSourceSels) {
      if (targetArtistIds.has(s.artistId)) {
        skipped += 1;
        continue;
      }
      await ctx.db.insert("memberSelections", {
        memberId: targetMemberId,
        artistId: s.artistId,
        addedAt: Date.now(),
      });
      added += 1;
    }
    return {
      added,
      skipped,
      removed: mode === "replace" ? targetSelsToDelete.length : 0,
    };
  },
});
