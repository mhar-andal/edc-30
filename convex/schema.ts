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
   * Map pin associated with a meet-spot label. The label IS the spot
   * (e.g. "Electric Avenue Sign"); pinning it adds a position + color
   * that's then reused by every meetup or sidequest that picks the
   * same label. There's no row when a label has no pin yet.
   *
   * Lookup key is `labelKey` — the label trimmed and lower-cased — so
   * "Electric Avenue Sign" and "electric avenue sign" reference the
   * same spot. The display label keeps the most-recent casing.
   */
  spots: defineTable({
    labelKey: v.string(),
    label: v.string(),
    /** Normalized [0..1] horizontal position. */
    mapX: v.number(),
    /** Normalized [0..1] vertical position. */
    mapY: v.number(),
    /** Pin tint, hex string like "#f43f5e". */
    pinColor: v.string(),
    createdAt: v.number(),
    editedAt: v.number(),
    /**
     * Last person to set/move the pin for this spot. Optional so seed
     * data doesn't have to attribute itself to a member.
     */
    editedByMemberId: v.optional(v.id("members")),
  }).index("by_label", ["labelKey"]),

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
      v.literal("pin_changed"),
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
     *   - pin:      fromMapX/Y, toMapX/Y, fromPinColor, toPinColor
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
        fromMapX: v.optional(v.number()),
        fromMapY: v.optional(v.number()),
        toMapX: v.optional(v.number()),
        toMapY: v.optional(v.number()),
        fromPinColor: v.optional(v.string()),
        toPinColor: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerType", "ownerId", "createdAt"])
    .index("by_actor", ["actorMemberId"]),

  /**
   * In-app notifications surfaced via the header bell. Today the only
   * `kind` is `"mention"` (someone wrote `@You` in a comment), but
   * leaving the union open-ended lets us add more (e.g. "joined your
   * sidequest", "convergence spot picked") without a schema rev.
   *
   * Each row carries enough denormalized context (author, owner key,
   * body snippet) to render the notification list without re-fetching
   * the source comment — useful when the source has since been edited
   * or deleted, and cheap because the rows are short-lived.
   *
   * Cascades:
   *  - When the source `comments` row is deleted, its notifications
   *    are deleted too.
   *  - When the parent sidequest is deleted, its comments — and
   *    therefore their notifications — cascade away.
   *  - When a member is removed, both their incoming (recipient) and
   *    outgoing (author) notifications are cleaned up so we never
   *    render orphaned rows.
   *
   * `readAt` is optional: undefined means unread. We use that
   * convention rather than a boolean so the timestamp is
   * automatically captured the first time the user reads it.
   */
  notifications: defineTable({
    recipientMemberId: v.id("members"),
    kind: v.union(v.literal("mention")),
    commentId: v.id("comments"),
    ownerType: v.union(v.literal("sidequest"), v.literal("convergence")),
    ownerId: v.string(),
    authorMemberId: v.id("members"),
    /** Truncated comment body for display in the notification list. */
    bodyPreview: v.string(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_recipient", ["recipientMemberId", "createdAt"])
    .index("by_comment", ["commentId"])
    .index("by_author", ["authorMemberId"]),
});
