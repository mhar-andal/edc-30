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

