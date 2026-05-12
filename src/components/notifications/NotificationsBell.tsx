import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { Bell, BellOff, Check, Loader2, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MentionText } from "@/components/MentionText";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { useIsOffline } from "@/lib/useIsOffline";
import type { MentionMember } from "@/lib/mentions";
import { cn } from "@/lib/utils";

type Notification = Doc<"notifications">;

interface Props {
  myMemberId: Id<"members">;
}

const BADGE_OVERFLOW = 99;
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

export function NotificationsBell({ myMemberId }: Props) {
  const navigate = useNavigate();
  const offline = useIsOffline();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<Id<"notifications"> | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const notificationsRaw = useCachedQuery(
    api.notifications.listForMember,
    { memberId: myMemberId },
  );
  const unreadCountRaw = useCachedQuery(
    api.notifications.unreadCountForMember,
    { memberId: myMemberId },
  );
  const membersRaw = useCachedQuery(api.members.list);
  const sidequestsRaw = useCachedQuery(api.sidequests.listAll);

  // Defensive: useCachedQuery may return cached values from a
  // previous code version that had a different shape. Filter to the
  // expected types so we never crash on something like .map() being
  // called on a number.
  const notifications: Notification[] = Array.isArray(notificationsRaw)
    ? notificationsRaw
    : [];
  const members = Array.isArray(membersRaw) ? membersRaw : [];
  const sidequests = Array.isArray(sidequestsRaw) ? sidequestsRaw : [];

  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const removeOne = useMutation(api.notifications.remove);

  const membersById = useMemo(() => {
    const m = new Map<string, Doc<"members">>();
    for (const x of members) m.set(x._id, x);
    return m;
  }, [members]);
  const sidequestsById = useMemo(() => {
    const m = new Map<string, Doc<"sidequests">>();
    for (const x of sidequests) m.set(x._id, x);
    return m;
  }, [sidequests]);

  const mentionMembers = useMemo<MentionMember[]>(
    () =>
      members.map((m) => ({
        _id: m._id,
        name: m.name,
        color: m.color,
      })),
    [members],
  );

  const unreadCount =
    typeof unreadCountRaw === "number" && Number.isFinite(unreadCountRaw)
      ? unreadCountRaw
      : 0;
  const hasUnread = unreadCount > 0;

  async function handleOpen(n: Notification) {
    if (n.readAt === undefined && !offline) {
      try {
        await markRead({ notificationId: n._id, memberId: myMemberId });
      } catch {
        // best-effort: still navigate even if the read flip failed.
      }
    }
    if (n.ownerType === "convergence") {
      navigate(`/coordinate?focus=${encodeURIComponent(n.ownerId)}`);
    } else {
      navigate("/schedule");
    }
    setOpen(false);
  }

  async function handleMarkAll() {
    if (offline || busyAll) return;
    setBusyAll(true);
    try {
      await markAllRead({ memberId: myMemberId });
    } finally {
      setBusyAll(false);
    }
  }

  async function handleRemove(n: Notification) {
    if (offline || busyId) return;
    setBusyId(n._id);
    try {
      await removeOne({ notificationId: n._id, memberId: myMemberId });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            hasUnread
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <Bell className="size-4" />
          {hasUnread && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground ring-2 ring-background"
            >
              {unreadCount > BADGE_OVERFLOW
                ? `${BADGE_OVERFLOW}+`
                : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(360px,calc(100vw-1.5rem))] gap-0 p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <Bell className="size-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold">Notifications</span>
            {hasUnread && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {unreadCount > BADGE_OVERFLOW
                  ? `${BADGE_OVERFLOW}+`
                  : unreadCount}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={!hasUnread || offline || busyAll}
            onClick={() => void handleMarkAll()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title={
              offline
                ? "Offline — reconnect to mark read"
                : "Mark all as read"
            }
          >
            {busyAll ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
            Mark all read
          </button>
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-muted-foreground">
            <BellOff className="size-5 opacity-60" />
            <span>No notifications yet</span>
            <span className="text-[10px]">
              You'll see @-mentions on sidequests + convergences here.
            </span>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {notifications.map((n) => {
              const author = membersById.get(n.authorMemberId);
              const isUnread = n.readAt === undefined;
              const where = describeOwner(n, sidequestsById);
              return (
                <li
                  key={n._id}
                  className={cn(
                    "border-b border-border/30 last:border-b-0",
                    isUnread && "bg-primary/5",
                  )}
                >
                  <div className="group flex items-start gap-1 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => void handleOpen(n)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <span
                        aria-hidden
                        className="mt-1 size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: author?.color ?? "currentColor",
                          opacity: isUnread ? 1 : 0.4,
                        }}
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-baseline gap-1.5 text-[12px]">
                          <span
                            className={cn(
                              "truncate",
                              isUnread
                                ? "font-semibold text-foreground"
                                : "font-medium text-muted-foreground",
                            )}
                          >
                            {author?.name ?? "Someone"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            mentioned you
                          </span>
                          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {formatRelative(n.createdAt)}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "line-clamp-2 text-[12px] leading-snug",
                            isUnread
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          <MentionText
                            body={n.bodyPreview}
                            members={mentionMembers}
                            myMemberId={myMemberId}
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          on {where}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={offline || busyId === n._id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRemove(n);
                      }}
                      title={
                        offline ? "Offline — reconnect to dismiss" : "Dismiss"
                      }
                      aria-label="Dismiss"
                      className="ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {busyId === n._id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function describeOwner(
  n: Notification,
  sidequestsById: Map<string, Doc<"sidequests">>,
): string {
  if (n.ownerType === "convergence") {
    // ownerId format: `${day}|${windowStartMs}|${windowEndMs}|${destinationStage}`
    const parts = n.ownerId.split("|");
    const stage = parts[3];
    return stage ? `meetup → ${stage}` : "a meetup";
  }
  const sq = sidequestsById.get(n.ownerId);
  return sq ? `“${sq.title}”` : "a sidequest";
}

function formatRelative(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  const diff = Date.now() - ms;
  if (diff < 30 * 1000) return "now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 12 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h`;
  if (diff < 24 * 60 * 60 * 1000) {
    try {
      return TIME_FORMAT.format(new Date(ms));
    } catch {
      return "";
    }
  }
  try {
    return DATE_FORMAT.format(new Date(ms));
  } catch {
    return "";
  }
}
