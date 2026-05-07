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
     * Start of the agreed meet window. Optional — without it, the
     * meetup is "anytime in this window". When set, this is when
     * everyone is gathering at the spot.
     */
    meetMs: v.optional(v.number()),
    /**
     * End of the agreed meet window — when the group leaves the spot
     * for the destination stage. Optional and meaningful only when
     * `meetMs` is also set.
     */
    meetEndMs: v.optional(v.number()),
    editedAt: v.number(),
  })
    .index("by_day", ["day"])
    .index("by_window_stage", [
      "day",
      "windowStartMs",
      "windowEndMs",
      "destinationStage",
    ]),

  /**
   * Ad-hoc, member-created events that are NOT tied to an artist set
   * (e.g. "tacos at 8pm", "ferris wheel at midnight"). Confined to a
   * single festival day; cannot cross midnight. Edit/delete is restricted
   * to the creator; any member may join/leave via `sidequestParticipants`.
   */
  sidequests: defineTable({
    day: v.union(v.literal("day_1"), v.literal("day_2"), v.literal("day_3")),
    title: v.string(),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    startMs: v.number(),
    endMs: v.number(),
    createdByMemberId: v.id("members"),
    createdAt: v.number(),
    editedAt: v.number(),
  })
    .index("by_day_start", ["day", "startMs"])
    .index("by_creator", ["createdByMemberId"]),

  sidequestParticipants: defineTable({
    sidequestId: v.id("sidequests"),
    memberId: v.id("members"),
    joinedAt: v.number(),
  })
    .index("by_sidequest", ["sidequestId"])
    .index("by_member", ["memberId"])
    .index("by_sidequest_member", ["sidequestId", "memberId"]),

  /**
   * Comments attached to either a sidequest or a convergence meeting.
   *
   * Convergences are keyed by their composite identity rather than the
   * `meetups` row id, because a meetup row only materializes once
   * someone sets a spot/time. Using the composite key lets the first
   * comment on a convergence stand on its own without forcing a
   * `meetups` insert.
   *
   * - Sidequest:    ownerId = `<Id<"sidequests">>` (the row id).
   * - Convergence:  ownerId = `${day}|${windowStartMs}|${windowEndMs}|${destinationStage}`.
   */
  comments: defineTable({
    ownerType: v.union(v.literal("sidequest"), v.literal("convergence")),
    ownerId: v.string(),
    authorMemberId: v.id("members"),
    body: v.string(),
    /**
     * Member ids resolved from `@Name` tokens in `body` at write time.
     * Used by the renderer to highlight + (eventually) drive
     * notifications. A name that fails to resolve at write time stays
     * as plain text and won't show up here.
     */
    mentionedMemberIds: v.array(v.id("members")),
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerType", "ownerId", "createdAt"])
    .index("by_author", ["authorMemberId"]),

  /**
   * Append-only changelog of structural changes to a sidequest or
   * convergence. Mirrors `comments`'s polymorphic owner scheme so the
   * changelog UI lives next to the comment thread on the same parent.
   *
   * Rows are written from inside the relevant mutations (sidequests,
   * meetups) and never edited. When a sidequest is deleted, its rows
   * are cascaded too. Convergence activity sticks around because the
   * convergence is identified by a composite key, not a row id.
   *
   * `actorMemberId` is optional: legacy callers may not pass one yet,
   * and seed/scripted writes also omit it. The UI falls back to
   * "Someone" in that case.
   */
  activity: defineTable({
    ownerType: v.union(v.literal("sidequest"), v.literal("convergence")),
    ownerId: v.string(),
    actorMemberId: v.optional(v.id("members")),
    kind: v.union(
      v.literal("created"),
      v.literal("spot_changed"),
      v.literal("time_changed"),
      v.literal("title_changed"),
      v.literal("location_changed"),
      v.literal("notes_changed"),
      v.literal("schedule_changed"),
      v.literal("joined"),
      v.literal("left"),
    ),
    /**
     * Snapshot of the change for renderable text. Free-form so we
     * don't lock ourselves in. Common keys:
     *   - spot:     fromLabel, toLabel
     *   - time:     fromMeetMs, toMeetMs, fromMeetEndMs, toMeetEndMs
     *   - title:    fromTitle, toTitle
     *   - location: fromLocation, toLocation
     *   - notes:    fromNotes, toNotes
     *   - schedule: fromStartMs, toStartMs, fromEndMs, toEndMs
     */
    data: v.optional(
      v.object({
        fromLabel: v.optional(v.string()),
        toLabel: v.optional(v.string()),
        fromMeetMs: v.optional(v.number()),
        toMeetMs: v.optional(v.number()),
        fromMeetEndMs: v.optional(v.number()),
        toMeetEndMs: v.optional(v.number()),
        fromTitle: v.optional(v.string()),
        toTitle: v.optional(v.string()),
        fromLocation: v.optional(v.string()),
        toLocation: v.optional(v.string()),
        fromNotes: v.optional(v.string()),
        toNotes: v.optional(v.string()),
        fromStartMs: v.optional(v.number()),
        toStartMs: v.optional(v.number()),
        fromEndMs: v.optional(v.number()),
        toEndMs: v.optional(v.number()),
      }),
    ),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerType", "ownerId", "createdAt"])
    .index("by_actor", ["actorMemberId"]),
});
