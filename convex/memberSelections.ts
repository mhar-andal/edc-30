import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const DAY_VALIDATOR = v.union(
  v.literal("day_1"),
  v.literal("day_2"),
  v.literal("day_3"),
);

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

/**
 * Removes every selection a member has for artists scheduled on the
 * given festival day. Used by the "Reset day's picks" affordances in
 * Schedule and the Quick-pick walkthrough so the user can start
 * fresh on a single day without nuking their picks for the other
 * two. Returns the count of rows deleted so the UI can confirm what
 * happened (or no-op silently if there was nothing to clear).
 */
export const clearForDay = mutation({
  args: {
    memberId: v.id("members"),
    day: DAY_VALIDATOR,
  },
  handler: async (ctx, { memberId, day }) => {
    // Pull every artist on the day once so we can intersect against
    // the member's selections in memory. Avoids per-pick artist
    // lookups when a member has dozens of picks across the festival.
    const dayArtists = await ctx.db
      .query("artists")
      .withIndex("by_day_start", (q) => q.eq("day", day))
      .collect();
    const dayArtistIds = new Set<string>(
      dayArtists.map((a) => a._id as string),
    );
    if (dayArtistIds.size === 0) return { removed: 0 };

    const selections = await ctx.db
      .query("memberSelections")
      .withIndex("by_member", (q) => q.eq("memberId", memberId))
      .collect();

    let removed = 0;
    for (const sel of selections) {
      if (!dayArtistIds.has(sel.artistId as string)) continue;
      await ctx.db.delete(sel._id);
      removed++;
    }
    return { removed };
  },
});

/**
 * Idempotent bulk-add. Inserts a `memberSelections` row for every
 * (memberId, artistId) pair that doesn't already exist. Used by the
 * Quick-pick "copy picks from a friend" flow — duplicates are
 * silently skipped so the caller doesn't need to pre-diff. Returns
 * the number of rows actually inserted so the UI can confirm what
 * happened.
 */
export const addMany = mutation({
  args: {
    memberId: v.id("members"),
    artistIds: v.array(v.id("artists")),
  },
  handler: async (ctx, { memberId, artistIds }) => {
    let added = 0;
    const seen = new Set<string>();
    for (const artistId of artistIds) {
      // Defend against caller passing the same id twice in one call.
      if (seen.has(artistId)) continue;
      seen.add(artistId);
      const exists = await ctx.db
        .query("memberSelections")
        .withIndex("by_member_artist", (q) =>
          q.eq("memberId", memberId).eq("artistId", artistId),
        )
        .first();
      if (exists) continue;
      await ctx.db.insert("memberSelections", {
        memberId,
        artistId,
        addedAt: Date.now(),
      });
      added++;
    }
    return { added };
  },
});

