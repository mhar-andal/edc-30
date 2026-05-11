import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Lookup key for a label. Trimming + lower-casing makes
 * "Electric Avenue Sign" and "electric avenue sign" match the same
 * spot, so the same pin gets reused across slightly-different
 * casings. Falls back to the empty string for empty/whitespace input
 * so the caller can guard against creating no-name spots.
 */
export function spotLabelKey(label: string): string {
  return label.trim().toLowerCase();
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Returns every pinned spot. The list is small — one per label. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("spots").collect();
  },
});

/**
 * Pin (or repin) the given label. Creates a row if none exists,
 * otherwise updates the existing row. Coordinates are clamped to
 * [0, 1] and the color is validated as a 6-digit hex.
 *
 * Anyone may call this — meet spots are shared scenery, not
 * member-owned data.
 */
export const setPin = mutation({
  args: {
    label: v.string(),
    mapX: v.number(),
    mapY: v.number(),
    pinColor: v.string(),
    actorMemberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    const trimmed = args.label.trim();
    if (!trimmed) {
      throw new Error("Spot label is required.");
    }
    if (trimmed.length > 64) {
      throw new Error("Spot label is too long (max 64 characters).");
    }
    if (!Number.isFinite(args.mapX) || !Number.isFinite(args.mapY)) {
      throw new Error("Pin coordinates must be finite numbers.");
    }
    const color = args.pinColor.trim();
    if (!HEX_COLOR_RE.test(color)) {
      throw new Error("pinColor must be a 6-digit hex string like #f43f5e.");
    }

    const labelKey = spotLabelKey(trimmed);
    const x = Math.min(Math.max(args.mapX, 0), 1);
    const y = Math.min(Math.max(args.mapY, 0), 1);

    const existing = await ctx.db
      .query("spots")
      .withIndex("by_label", (q) => q.eq("labelKey", labelKey))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        // Refresh the display label so the most-recent casing wins.
        label: trimmed,
        mapX: x,
        mapY: y,
        pinColor: color,
        editedAt: now,
        editedByMemberId: args.actorMemberId,
      });
      return existing._id;
    }
    return await ctx.db.insert("spots", {
      labelKey,
      label: trimmed,
      mapX: x,
      mapY: y,
      pinColor: color,
      createdAt: now,
      editedAt: now,
      editedByMemberId: args.actorMemberId,
    });
  },
});

/**
 * Drop the pin associated with this label, leaving the label intact
 * on any meetups/sidequests that reference it. Idempotent: clearing
 * an unpinned label is a no-op.
 */
export const clearPin = mutation({
  args: {
    label: v.string(),
  },
  handler: async (ctx, { label }) => {
    const labelKey = spotLabelKey(label);
    if (!labelKey) return;
    const existing = await ctx.db
      .query("spots")
      .withIndex("by_label", (q) => q.eq("labelKey", labelKey))
      .first();
    if (!existing) return;
    await ctx.db.delete(existing._id);
  },
});
