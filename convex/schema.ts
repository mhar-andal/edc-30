import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  members: defineTable({
    name: v.string(),
    nameLower: v.string(),
    color: v.string(),
    createdAt: v.number(),
  }).index("by_nameLower", ["nameLower"]),

  artists: defineTable({
    name: v.string(),
    stage: v.string(),
    day: v.union(v.literal("day_1"), v.literal("day_2"), v.literal("day_3")),
    startMs: v.number(),
    endMs: v.number(),
    crossesMidnight: v.boolean(),
  })
    .index("by_day_start", ["day", "startMs"])
    .index("by_stage_start", ["stage", "startMs"]),

  memberSelections: defineTable({
    memberId: v.id("members"),
    artistId: v.id("artists"),
    addedAt: v.number(),
  })
    .index("by_member", ["memberId"])
    .index("by_member_artist", ["memberId", "artistId"]),

  meetups: defineTable({
    day: v.union(v.literal("day_1"), v.literal("day_2"), v.literal("day_3")),
    windowStartMs: v.number(),
    windowEndMs: v.number(),
    /**
     * The shared destination stage for this convergence. Combined with
     * the day + window, this uniquely identifies the convergence. The
     * actual people participating are derived from current selections;
     * a meetup is not tied to any particular set of members.
     */
    destinationStage: v.string(),
    /** Chosen meeting-spot label, e.g. "Electric Avenue Sign". */
    label: v.optional(v.string()),
    /**
     * Specific moment within the convergence window everyone has
     * agreed to converge at. Optional — without it, the meetup is
     * "anytime in this window".
     */
    meetMs: v.optional(v.number()),
    editedAt: v.number(),
  })
    .index("by_day", ["day"])
    .index("by_window_stage", [
      "day",
      "windowStartMs",
      "windowEndMs",
      "destinationStage",
    ]),
});
