import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  ChevronDown,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { MentionText } from "@/components/MentionText";
import {
  MentionTextarea,
  type MentionTextareaHandle,
} from "@/components/MentionTextarea";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { useIsOffline } from "@/lib/useIsOffline";
import type { MentionMember } from "@/lib/mentions";
import { cn } from "@/lib/utils";

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

interface Props {
  ownerType: "sidequest" | "convergence";
  ownerId: string;
  myMemberId: Id<"members"> | null;
  membersById: Map<string, Doc<"members">>;
  /**
   * When true, a sticky "Comments" heading + count is shown.
   * Defaults to true. Disable for embeds that already render their own.
   */
  showHeading?: boolean;
  className?: string;
}

export function CommentsSection({
  ownerType,
  ownerId,
  myMemberId,
  membersById,
  showHeading = true,
  className,
}: Props) {
  const offline = useIsOffline();
  const comments = useCachedQuery(api.comments.listForOwner, {
    ownerType,
    ownerId,
  });
  const add = useMutation(api.comments.add);
  const remove = useMutation(api.comments.remove);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<Id<"comments"> | null>(null);
  // Collapsed by default. When `showHeading` is false the section is treated
  // as embedded and always rendered expanded.
  const [expanded, setExpanded] = useState(!showHeading);
  // When the user clicks "Add a comment" while collapsed and empty, focus
  // the textarea once it mounts.
  const [autoFocusComposer, setAutoFocusComposer] = useState(false);
  const taRef = useRef<MentionTextareaHandle>(null);

  const memberList = useMemo<MentionMember[]>(() => {
    const out: MentionMember[] = [];
    for (const m of membersById.values()) {
      out.push({ _id: m._id, name: m.name, color: m.color });
    }
    return out;
  }, [membersById]);

  const sortedComments = useMemo(() => {
    const arr = (comments ?? []).slice();
    arr.sort((a, b) => a.createdAt - b.createdAt);
    return arr;
  }, [comments]);

  async function handlePost() {
    if (!myMemberId) {
      setError("Sign in to comment.");
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (offline) {
      setError("Offline — reconnect to post.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await add({
        ownerType,
        ownerId,
        authorMemberId: myMemberId,
        body: trimmed,
      });
      setDraft("");
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(commentId: Id<"comments">) {
    if (!myMemberId || offline) return;
    setRemovingId(commentId);
    setError(null);
    try {
      await remove({ commentId, memberId: myMemberId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setRemovingId(null);
    }
  }

  const loading = comments === undefined;
  const totalCount = sortedComments.length;
  const canPost = !!myMemberId && !offline && !busy && draft.trim().length > 0;

  // Focus the composer when the user opens via "Add a comment".
  useEffect(() => {
    if (expanded && autoFocusComposer) {
      taRef.current?.focus();
      setAutoFocusComposer(false);
    }
  }, [expanded, autoFocusComposer]);

  // Collapsed trigger — only when `showHeading` is true (embedded uses are
  // always expanded). While loading we still render a minimal trigger so the
  // layout doesn't jump.
  if (showHeading && !expanded) {
    const triggerLabel = loading
      ? "Comments…"
      : totalCount === 0
        ? myMemberId
          ? "Add a comment"
          : "No comments yet"
        : `Show ${totalCount} comment${totalCount === 1 ? "" : "s"}`;
    const TriggerIcon =
      !loading && totalCount === 0 && myMemberId ? Plus : MessageCircle;
    const isAddAction = !loading && totalCount === 0 && !!myMemberId;
    const isPassive = !loading && totalCount === 0 && !myMemberId;
    return (
      <div className={cn(className)}>
        <button
          type="button"
          disabled={isPassive}
          onClick={() => {
            setExpanded(true);
            if (isAddAction) setAutoFocusComposer(true);
          }}
          className={cn(
            "inline-flex w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
            isPassive
              ? "cursor-default border-border/40 text-muted-foreground"
              : "border-border/60 text-foreground hover:bg-secondary/60",
          )}
        >
          <TriggerIcon className="size-3.5" />
          <span>{triggerLabel}</span>
          {totalCount > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
              <ChevronDown className="size-3.5" />
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      {showHeading && (
        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MessageCircle className="size-3" />
            Comments
            {totalCount > 0 && (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                {totalCount}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex items-center gap-1 rounded text-[10px] font-medium normal-case tracking-normal text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Collapse comments"
          >
            Hide
            <ChevronDown className="size-3 rotate-180" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Loading…
        </div>
      ) : sortedComments.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-2 py-2 text-center text-[11px] text-muted-foreground">
          No comments yet. Tag a friend with <code>@</code>.
        </div>
      ) : (
        <ul className="space-y-2">
          {sortedComments.map((c) => {
            const author = membersById.get(c.authorMemberId);
            const mine = !!myMemberId && c.authorMemberId === myMemberId;
            const tagsMe =
              !!myMemberId && c.mentionedMemberIds.some((id) => id === myMemberId);
            return (
              <li
                key={c._id}
                className={cn(
                  "rounded-md border px-2.5 py-2",
                  tagsMe
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/50 bg-card/30",
                )}
              >
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: author?.color ?? "#6b7280" }}
                  />
                  <span className="truncate font-medium text-foreground">
                    {author?.name ?? "Unknown"}
                  </span>
                  {mine && (
                    <span className="rounded-sm bg-primary/15 px-1 text-[9px] uppercase tracking-wide text-primary">
                      you
                    </span>
                  )}
                  <span className="ml-auto tabular-nums">
                    {formatRelative(c.createdAt)}
                  </span>
                  {mine && (
                    <button
                      type="button"
                      disabled={offline || removingId === c._id}
                      onClick={() => void handleDelete(c._id)}
                      title="Delete comment"
                      className="ml-1 inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      aria-label="Delete comment"
                    >
                      {removingId === c._id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </button>
                  )}
                </div>
                <div className="mt-1">
                  <MentionText
                    body={c.body}
                    members={memberList}
                    myMemberId={myMemberId}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {myMemberId ? (
        <div className="space-y-1.5">
          <MentionTextarea
            ref={taRef}
            value={draft}
            onChange={setDraft}
            onSubmit={handlePost}
            placeholder="Add a comment… type @ to tag"
            members={memberList}
            excludeMemberId={myMemberId}
            disabled={offline || busy}
            rows={2}
            maxLength={1000}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              {offline
                ? "Offline — reconnect to post."
                : "⌘/Ctrl + Enter to send"}
            </span>
            <Button
              size="sm"
              onClick={handlePost}
              disabled={!canPost}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              Post
            </Button>
          </div>
          {error && (
            <p className="text-[11px] text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Sign in to leave a comment.
        </p>
      )}
    </div>
  );
}

/**
 * Lightweight relative formatter: "just now", "5m", "2h", or local time.
 */
function formatRelative(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  const diff = Date.now() - ms;
  if (diff < 30 * 1000) return "just now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 12 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h`;
  try {
    return TIME_FORMAT.format(new Date(ms));
  } catch {
    return "";
  }
}
