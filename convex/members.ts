import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db.query("members").collect();
    return members.sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const get = query({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    return await ctx.db.get(memberId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, { name, color }) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new Error("Name cannot be empty.");
    if (trimmed.length > 32) throw new Error("Name is too long (max 32).");
    const nameLower = trimmed.toLowerCase();
    const existingByName = await ctx.db
      .query("members")
      .withIndex("by_nameLower", (q) => q.eq("nameLower", nameLower))
      .first();
    if (existingByName) {
      throw new Error("NAME_TAKEN");
    }
    const colorLower = color.toLowerCase();
    const existingByColor = await ctx.db
      .query("members")
      .filter((q) => q.eq(q.field("color"), colorLower))
      .first();
    if (existingByColor) {
      throw new Error("COLOR_TAKEN");
    }
    const id: Id<"members"> = await ctx.db.insert("members", {
      name: trimmed,
      nameLower,
      color: colorLower,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const rename = mutation({
  args: {
    memberId: v.id("members"),
    name: v.string(),
  },
  handler: async (ctx, { memberId, name }) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new Error("Name cannot be empty.");
    if (trimmed.length > 32) throw new Error("Name is too long (max 32).");
    const nameLower = trimmed.toLowerCase();
    const conflict = await ctx.db
      .query("members")
      .withIndex("by_nameLower", (q) => q.eq("nameLower", nameLower))
      .first();
    if (conflict && conflict._id !== memberId) {
      throw new Error("NAME_TAKEN");
    }
    await ctx.db.patch(memberId, { name: trimmed, nameLower });
  },
});

export const setColor = mutation({
  args: {
    memberId: v.id("members"),
    color: v.string(),
  },
  handler: async (ctx, { memberId, color }) => {
    const colorLower = color.toLowerCase();
    const conflict = await ctx.db
      .query("members")
      .filter((q) => q.eq(q.field("color"), colorLower))
      .first();
    if (conflict && conflict._id !== memberId) {
      throw new Error("COLOR_TAKEN");
    }
    await ctx.db.patch(memberId, { color: colorLower });
  },
});

export const remove = mutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const selections = await ctx.db
      .query("memberSelections")
      .withIndex("by_member", (q) => q.eq("memberId", memberId))
      .collect();
    for (const s of selections) await ctx.db.delete(s._id);

    // Meetups are pinned to a convergence (day + window + destination
    // stage), not to any particular members, so they survive when a
    // member leaves. Nothing to clean up on the meetups table.

    // Sidequests authored by this member are deleted along with their
    // participant rows. RSVPs by this member to other people's
    // sidequests just get the participant row removed.
    const authoredSidequests = await ctx.db
      .query("sidequests")
      .withIndex("by_creator", (q) => q.eq("createdByMemberId", memberId))
      .collect();
    for (const sq of authoredSidequests) {
      const ps = await ctx.db
        .query("sidequestParticipants")
        .withIndex("by_sidequest", (q) => q.eq("sidequestId", sq._id))
        .collect();
      for (const p of ps) await ctx.db.delete(p._id);
      await ctx.db.delete(sq._id);
    }
    const myRsvps = await ctx.db
      .query("sidequestParticipants")
      .withIndex("by_member", (q) => q.eq("memberId", memberId))
      .collect();
    for (const r of myRsvps) await ctx.db.delete(r._id);

    await ctx.db.delete(memberId);
  },
});
