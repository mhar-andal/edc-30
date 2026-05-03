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
    memberAId: v.id("members"),
    memberBId: v.id("members"),
    /** Place label, e.g. "Electric Avenue Sign" or any custom-typed spot. */
    label: v.optional(v.string()),
    /** Optional, more specific time within the convergence window. */
    meetupStartMs: v.optional(v.number()),
    meetupEndMs: v.optional(v.number()),
    editedByMemberId: v.id("members"),
    editedAt: v.number(),
  })
    .index("by_day", ["day"])
    .index("by_window_pair", [
      "day",
      "windowStartMs",
      "windowEndMs",
      "memberAId",
      "memberBId",
    ]),
});
