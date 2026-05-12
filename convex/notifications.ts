import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

/** Hard cap on the most recent notifications returned to the client. */
const LIST_LIMIT = 50;

/**
 * Most recent notifications for the given member, newest first.
 * Limited to `LIST_LIMIT` so the bell popover stays snappy even for
 * heavily-mentioned users — anything older drops off the end.
 */
export const listForMember = query({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_recipient", (q) =>
        q.eq("recipientMemberId", memberId),
      )
      .order("desc")
      .take(LIST_LIMIT);
  },
});

/**
 * Count of unread notifications for the bell badge. Returns the raw
 * integer (capped at `LIST_LIMIT + 1` so we can render a "50+" hint
 * without scanning unbounded history).
 */
export const unreadCountForMember = query({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    let count = 0;
    // Walk the recipient index newest-first so we can short-circuit
    // once we know there are "more than the badge cares about".
    for await (const n of ctx.db
      .query("notifications")
      .withIndex("by_recipient", (q) =>
        q.eq("recipientMemberId", memberId),
      )
      .order("desc")) {
      if (n.readAt === undefined) {
        count++;
        if (count > LIST_LIMIT) return count;
      }
    }
    return count;
  },
});

export const markRead = mutation({
  args: {
    notificationId: v.id("notifications"),
    memberId: v.id("members"),
  },
  handler: async (ctx, { notificationId, memberId }) => {
    const row = await ctx.db.get(notificationId);
    if (!row) return;
    if (row.recipientMemberId !== memberId) {
      throw new Error("That notification isn't yours.");
    }
    if (row.readAt !== undefined) return;
    await ctx.db.patch(notificationId, { readAt: Date.now() });
  },
});

export const markAllRead = mutation({
  args: { memberId: v.id("members") },
  handler: async (ctx, { memberId }) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_recipient", (q) =>
        q.eq("recipientMemberId", memberId),
      )
      .collect();
    for (const r of rows) {
      if (r.readAt === undefined) {
        await ctx.db.patch(r._id, { readAt: now });
      }
    }
  },
});

/**
 * Delete a single notification. Used by the bell popover so the user
 * can dismiss a single mention without affecting the rest.
 */
export const remove = mutation({
  args: {
    notificationId: v.id("notifications"),
    memberId: v.id("members"),
  },
  handler: async (ctx, { notificationId, memberId }) => {
    const row = await ctx.db.get(notificationId);
    if (!row) return;
    if (row.recipientMemberId !== memberId) {
      throw new Error("That notification isn't yours.");
    }
    await ctx.db.delete(row._id);
  },
});

// ---------- Internal helpers used by other mutations ----------

/**
 * Maximum length of the body snippet stored on a notification row.
 * Comments can be up to 1000 chars, but the bell list is meant to be
 * a peek; the full body is always available by clicking through.
 */
const BODY_PREVIEW_MAX = 200;

/**
 * Truncate a comment body for the notification list. Visible to
 * other modules so they can match the truncation rule in tests etc.
 */
export function previewForBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= BODY_PREVIEW_MAX) return trimmed;
  return trimmed.slice(0, BODY_PREVIEW_MAX - 1).trimEnd() + "…";
}

/**
 * Insert one mention notification per recipient. Skips the author —
 * mentioning yourself shouldn't ping you. Caller is expected to have
 * already validated that `comment` exists. Returns the inserted ids
 * for the convenience of any future tracing / tests.
 */
export async function recordMentionNotifications(
  ctx: MutationCtx,
  args: {
    comment: Doc<"comments">;
    recipients: Array<Id<"members">>;
  },
): Promise<Array<Id<"notifications">>> {
  const { comment, recipients } = args;
  const ids: Array<Id<"notifications">> = [];
  const seen = new Set<string>();
  const now = Date.now();
  const preview = previewForBody(comment.body);
  for (const recipientId of recipients) {
    if (recipientId === comment.authorMemberId) continue;
    if (seen.has(recipientId)) continue;
    seen.add(recipientId);
    const id = await ctx.db.insert("notifications", {
      recipientMemberId: recipientId,
      kind: "mention",
      commentId: comment._id,
      ownerType: comment.ownerType,
      ownerId: comment.ownerId,
      authorMemberId: comment.authorMemberId,
      bodyPreview: preview,
      createdAt: now,
    });
    ids.push(id);
  }
  return ids;
}
