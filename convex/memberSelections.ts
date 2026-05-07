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

