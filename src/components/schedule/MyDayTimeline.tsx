import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarPlus,
  Clock,
  Eye,
  GitCompare,
  Loader2,
  MapPin,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberChip } from "@/components/MemberChip";
import { MemberDot } from "@/components/MemberDot";
import { SidequestPopover } from "@/components/sidequests/SidequestPopover";
import { MapDayDialog } from "@/components/map/MapDayDialog";
import { getStagePalette } from "@/lib/colors";
import {
  FESTIVAL_DAY_RANGE_MS,
  FESTIVAL_DAY_HOURS,
  formatHour,
  formatRange,
  formatTime,
  getCurrentFestivalDay,
  type DayKey,
} from "@/lib/time";
import {
  buildJourney,
  findConvergences,
  meetupKey,
  type Convergence,
} from "@/lib/coordinate";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { useIsOffline } from "@/lib/useIsOffline";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import type {
  Artist,
  Member,
  ScheduleData,
  Sidequest,
} from "@/lib/useScheduleData";
import { cn } from "@/lib/utils";

interface Props {
  day: DayKey;
  data: ScheduleData;
  myMemberId: Id<"members"> | null;
  /** Called when user requests to create a new sidequest from the empty state. */
  onCreateSidequest?: () => void;
  onEditSidequest?: (sidequest: Sidequest) => void;
  /** Re-opens the artist quick-pick walkthrough dialog. */
  onOpenWalkthrough?: () => void;
}

const PIXELS_PER_HOUR = 80;
const TIME_COLUMN_PX = 56;
const MIN_EVENT_HEIGHT_PX = 36;

interface BaseEvent {
  id: string;
  startMs: number;
  endMs: number;
  /**
   * Tracked members who own this event. In single-viewer mode this is
   * just the viewed member. In compare mode it can be one or both of
   * the compared members, which lets cards render owner badges so the
   * user can tell at a glance whose schedule the event belongs to (or
   * if it's shared between both).
   */
  ownerIds: Array<Id<"members">>;
}

interface ArtistEvent extends BaseEvent {
  kind: "artist";
  artist: Artist;
}

interface MeetupEvent extends BaseEvent {
  kind: "meetup";
  conv: Convergence;
  spot: Doc<"meetups"> | undefined;
}

interface SidequestEvent extends BaseEvent {
  kind: "sidequest";
  sidequest: Sidequest;
}

type TimelineEvent = ArtistEvent | MeetupEvent | SidequestEvent;

interface PlacedEvent {
  event: TimelineEvent;
  lane: number;
  totalLanes: number;
}

/**
 * Pack events into lanes per overlap cluster so concurrent items
 * sit side-by-side in equal widths and standalone items take the
 * full content column.
 */
function layoutEvents(events: TimelineEvent[]): PlacedEvent[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort(
    (a, b) => a.startMs - b.startMs || b.endMs - a.endMs,
  );

  const clusters: TimelineEvent[][] = [];
  let currentCluster: TimelineEvent[] = [];
  let currentEnd = -Infinity;
  for (const e of sorted) {
    if (e.startMs < currentEnd) {
      currentCluster.push(e);
      currentEnd = Math.max(currentEnd, e.endMs);
    } else {
      if (currentCluster.length > 0) clusters.push(currentCluster);
      currentCluster = [e];
      currentEnd = e.endMs;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  const placedById = new Map<string, PlacedEvent>();
  for (const cluster of clusters) {
    const laneEnds: number[] = [];
    const laneAssignment = new Map<string, number>();
    for (const e of cluster) {
      let lane = -1;
      for (let i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i] <= e.startMs) {
          lane = i;
          laneEnds[i] = e.endMs;
          break;
        }
      }
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(e.endMs);
      }
      laneAssignment.set(e.id, lane);
    }
    const totalLanes = laneEnds.length;
    for (const e of cluster) {
      placedById.set(e.id, {
        event: e,
        lane: laneAssignment.get(e.id)!,
        totalLanes,
      });
    }
  }

  return events
    .map((e) => placedById.get(e.id)!)
    .filter((p): p is PlacedEvent => Boolean(p));
}

export function MyDayTimeline({
  day,
  data,
  myMemberId,
  onCreateSidequest,
  onEditSidequest,
  onOpenWalkthrough,
}: Props) {
  const range = FESTIVAL_DAY_RANGE_MS[day];
  const totalHeight = FESTIVAL_DAY_HOURS * PIXELS_PER_HOUR;
  const allMeetups = useCachedQuery(api.meetups.listAll) ?? [];

  // While the device clock is on a festival day we hide the
  // "Open Coordinate" link from meetup cards. Coordinate is for
  // pre-event planning; once the user is at the festival, the map is
  // the destination they actually need.
  const isFestivalDay = useMemo(() => getCurrentFestivalDay() !== null, []);

  // Whose day are we showing? Defaults to the signed-in member, but
  // can be flipped to any other member via the header dropdown so the
  // user can preview a friend's plan side-by-side. Mutating actions
  // (edit/create sidequests, walkthrough) stay attached to the
  // session member regardless of who's being viewed.
  const [viewedMemberId, setViewedMemberId] = useState<Id<"members"> | null>(
    myMemberId,
  );
  // Optional second member to compare against. When set the timeline
  // shows the union of both members' events with per-card ownership
  // badges so overlaps and divergences are visible at a glance.
  const [compareWithMemberId, setCompareWithMemberId] =
    useState<Id<"members"> | null>(null);
  // Re-default to ourselves when the underlying account changes (e.g.
  // a sign-out/in cycle while the timeline stays mounted).
  useEffect(() => {
    setViewedMemberId(myMemberId);
    setCompareWithMemberId(null);
  }, [myMemberId]);
  // If the compare partner becomes the same as the primary (e.g. the
  // user picked them in the primary dropdown while compare was active)
  // collapse out of compare mode rather than render a degenerate
  // "X vs X" view.
  useEffect(() => {
    if (
      compareWithMemberId !== null &&
      compareWithMemberId === viewedMemberId
    ) {
      setCompareWithMemberId(null);
    }
  }, [compareWithMemberId, viewedMemberId]);

  const isComparing = compareWithMemberId !== null;
  const isViewingSelf =
    viewedMemberId !== null && viewedMemberId === myMemberId;
  // Mutating actions are gated to the session user. In compare mode we
  // still allow them as long as the session user is one of the two
  // members on screen — that keeps the common "me vs friend" flow
  // editable while preventing edits when peeking at two friends.
  const sessionUserOnScreen =
    myMemberId !== null &&
    (viewedMemberId === myMemberId || compareWithMemberId === myMemberId);
  const viewedMember = viewedMemberId
    ? data.membersById.get(viewedMemberId)
    : null;
  const compareMember = compareWithMemberId
    ? data.membersById.get(compareWithMemberId)
    : null;

  // Roster shown in the dropdowns. Self always pinned to the top so
  // jumping back is a single click; everyone else sorted alphabetically.
  const memberOptions = useMemo<Member[]>(() => {
    const all = data.members;
    const me = myMemberId ? data.membersById.get(myMemberId) : undefined;
    const others = all
      .filter((m) => m._id !== myMemberId)
      .sort((a, b) => a.name.localeCompare(b.name));
    return me ? [me, ...others] : others;
  }, [data.members, data.membersById, myMemberId]);

  // Picks the most useful default compare partner when the user
  // engages compare mode: the session user themselves when peeking at
  // a friend, otherwise the first non-self member alphabetically.
  function defaultComparePartner(): Id<"members"> | null {
    if (viewedMemberId !== myMemberId && myMemberId) return myMemberId;
    const firstOther = memberOptions.find((m) => m._id !== viewedMemberId);
    return firstOther ? firstOther._id : null;
  }
  function startCompare() {
    const partner = defaultComparePartner();
    if (partner) setCompareWithMemberId(partner);
  }

  // Map dialog used to surface a meetup's pinned spot when the user
  // taps the spot chip inside a meetup card's popover. Held at the
  // timeline root so it doesn't get unmounted with the popover.
  const [mapDialog, setMapDialog] = useState<{
    open: boolean;
    label: string | null;
  }>({ open: false, label: null });
  const openSpotMap = (label: string) =>
    setMapDialog({ open: true, label });

  const events = useMemo<TimelineEvent[]>(() => {
    if (!viewedMemberId) return [];
    // The set of members whose schedules contribute to the timeline.
    // Single mode = just the viewed member; compare mode = both.
    const trackedIds: Array<Id<"members">> = compareWithMemberId
      ? [viewedMemberId, compareWithMemberId]
      : [viewedMemberId];
    const trackedSet = new Set<string>(trackedIds);
    const out: TimelineEvent[] = [];

    const dayArtists = data.artistsByDay.get(day) ?? [];
    for (const a of dayArtists) {
      const owners = trackedIds.filter((id) =>
        data.selectionsByMember.get(id)?.has(a._id),
      );
      if (owners.length === 0) continue;
      out.push({
        id: `artist:${a._id}`,
        kind: "artist",
        startMs: a.startMs,
        endMs: a.endMs,
        artist: a,
        ownerIds: owners,
      });
    }

    const dayQuests = data.sidequestsByDay.get(day) ?? [];
    for (const sq of dayQuests) {
      const owners = trackedIds.filter((id) =>
        sq.participantMemberIds.includes(id),
      );
      if (owners.length === 0) continue;
      out.push({
        id: `sidequest:${sq._id}`,
        kind: "sidequest",
        startMs: sq.startMs,
        endMs: sq.endMs,
        sidequest: sq,
        ownerIds: owners,
      });
    }

    const journeys = data.members
      .map((m) => {
        const ids = data.selectionsByMember.get(m._id) ?? new Set<string>();
        return buildJourney(m._id, day, ids, data.artistsByDay);
      })
      .filter((j) => j.artists.length > 0);
    const convergences = findConvergences(journeys, day);
    const spotByKey = new Map<string, Doc<"meetups">>();
    for (const m of allMeetups) {
      if (m.day !== day) continue;
      spotByKey.set(
        meetupKey(m.day, m.windowStartMs, m.windowEndMs, m.destinationStage),
        m,
      );
    }
    for (const conv of convergences) {
      const owners = conv.memberIds.filter((id) => trackedSet.has(id));
      if (owners.length === 0) continue;
      const key = meetupKey(
        conv.day,
        conv.windowStart,
        conv.windowEnd,
        conv.destinationStage,
      );
      out.push({
        id: `meetup:${key}`,
        kind: "meetup",
        startMs: conv.windowStart,
        endMs: conv.windowEnd,
        conv,
        spot: spotByKey.get(key),
        ownerIds: owners,
      });
    }

    out.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    return out;
  }, [day, data, viewedMemberId, compareWithMemberId, allMeetups]);

  const placed = useMemo(() => layoutEvents(events), [events]);
  // Sidequests the session user has joined on the visible day. Used
  // by ArtistTimelineCard to surface an amber "you've also joined a
  // sidequest at this time" warning inside the artist popover, the
  // same conflict signal the schedule view + quick-pick walkthrough
  // already render. Computed once here rather than per-card.
  const myJoinedSidequestsToday = useMemo<Sidequest[]>(() => {
    if (!myMemberId) return [];
    return (data.sidequestsByDay.get(day) ?? []).filter((sq) =>
      sq.participantMemberIds.includes(myMemberId),
    );
  }, [data.sidequestsByDay, day, myMemberId]);
  const counts = useMemo(() => {
    let artists = 0;
    let meetups = 0;
    let sidequests = 0;
    for (const e of events) {
      if (e.kind === "artist") artists++;
      else if (e.kind === "meetup") meetups++;
      else sidequests++;
    }
    return { artists, meetups, sidequests };
  }, [events]);

  const hourMarkers = useMemo(() => {
    const markers: Array<{ ms: number; label: string; topPx: number }> = [];
    const slots = Math.ceil(FESTIVAL_DAY_HOURS) + 1;
    for (let i = 0; i < slots; i++) {
      const ms = range.start + i * 60 * 60 * 1000;
      markers.push({
        ms,
        label: formatHour(ms),
        topPx: i * PIXELS_PER_HOUR,
      });
    }
    return markers;
  }, [range.start]);

  function msToPx(ms: number): number {
    return ((ms - range.start) / (range.end - range.start)) * totalHeight;
  }

  if (!myMemberId) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        Sign in on the Onboarding tab to see your personal day.
      </div>
    );
  }

  // After the guard above, the timeline always has a viewed member.
  // Default to the session user if local state hasn't caught up yet.
  const effectiveViewedMemberId: Id<"members"> = viewedMemberId ?? myMemberId;

  return (
    <div className="rounded-lg border border-border/60 bg-card/40">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary" />
            <span className="tabular-nums text-foreground">
              {counts.artists}
            </span>{" "}
            artists
          </span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span className="tabular-nums text-foreground">
              {counts.meetups}
            </span>{" "}
            meetups
          </span>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-violet-400" />
            <span className="tabular-nums text-foreground">
              {counts.sidequests}
            </span>{" "}
            sidequests
          </span>
        </div>
        {memberOptions.length > 0 && viewedMemberId && (
          <div className="flex items-center gap-1.5">
            <ViewerSelect
              value={viewedMemberId}
              members={memberOptions}
              myMemberId={myMemberId}
              displayLabel={
                isViewingSelf
                  ? "Your day"
                  : `${viewedMember?.name ?? "Someone"}'s day`
              }
              displayColor={viewedMember?.color ?? "#8b8b8b"}
              onChange={(v) => setViewedMemberId(v)}
              ariaLabel="View someone else's day"
            />
            {isComparing ? (
              <>
                <span
                  aria-hidden
                  className="text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  vs
                </span>
                <ViewerSelect
                  value={compareWithMemberId ?? ""}
                  members={memberOptions.filter(
                    (m) => m._id !== viewedMemberId,
                  )}
                  myMemberId={myMemberId}
                  displayLabel={compareMember?.name ?? "Pick a friend"}
                  displayColor={compareMember?.color ?? "#8b8b8b"}
                  onChange={(v) => setCompareWithMemberId(v)}
                  ariaLabel="Compare with"
                />
                <button
                  type="button"
                  onClick={() => setCompareWithMemberId(null)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-background/40 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                  aria-label="Exit compare mode"
                  title="Exit compare mode"
                >
                  <X className="size-3.5" />
                </button>
              </>
            ) : memberOptions.some((m) => m._id !== viewedMemberId) ? (
              <button
                type="button"
                onClick={startCompare}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-border/50 bg-background/40 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                aria-label="Compare with another member's day"
                title="Compare with a friend"
              >
                <GitCompare className="size-3" />
                Compare
              </button>
            ) : null}
          </div>
        )}
      </header>

      <div className="relative">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `${TIME_COLUMN_PX}px 1fr`,
            height: totalHeight,
          }}
        >
          <div className="relative border-r border-border/60">
            {hourMarkers.map((m) => (
              <div
                key={m.ms}
                className="absolute -translate-y-1/2 px-2 text-[10px] tabular-nums text-muted-foreground"
                style={{ top: m.topPx }}
              >
                {m.label}
              </div>
            ))}
          </div>

          <div className="relative">
            {hourMarkers.slice(1).map((m) => (
              <div
                key={m.ms}
                className="absolute left-0 right-0 border-t border-dashed border-border/30"
                style={{ top: m.topPx }}
              />
            ))}

            {placed.length === 0 && (
              <EmptyState
                isViewingSelf={isViewingSelf}
                isComparing={isComparing}
                viewedMemberName={viewedMember?.name ?? null}
                compareMemberName={compareMember?.name ?? null}
                onCreateSidequest={
                  sessionUserOnScreen ? onCreateSidequest : undefined
                }
                onOpenWalkthrough={
                  sessionUserOnScreen ? onOpenWalkthrough : undefined
                }
              />
            )}

            {placed.map(({ event, lane, totalLanes }) => {
              const top = Math.max(0, msToPx(event.startMs));
              const bottom = Math.max(top + MIN_EVENT_HEIGHT_PX, msToPx(event.endMs));
              const height = bottom - top;
              const widthPct = 100 / totalLanes;
              const leftPct = widthPct * lane;
              // In compare mode, when two slots overlap (totalLanes
              // > 1) we gently pulse them out of phase so the eye
              // can read what's beneath / next to a card without
              // having to mentally untangle stacked side-by-sides.
              // Phase shift = lane × cycle/totalLanes so each card
              // hits its dim peak when its neighbour is bright.
              const isInConflict = isComparing && totalLanes > 1;
              const conflictDelaySec =
                isInConflict && totalLanes > 0
                  ? -(lane * 3) / totalLanes
                  : undefined;
              return (
                <div
                  key={event.id}
                  className={cn(
                    "absolute px-1",
                    isInConflict && "animate-timeline-overlap-pulse",
                  )}
                  style={{
                    top,
                    height,
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    animationDelay:
                      conflictDelaySec !== undefined
                        ? `${conflictDelaySec}s`
                        : undefined,
                  }}
                >
                  <TimelineCard
                    event={event}
                    membersById={data.membersById}
                    selectionsByArtist={data.selectionsByArtist}
                    myMemberId={myMemberId}
                    viewedMemberId={effectiveViewedMemberId}
                    compareContext={
                      isComparing && viewedMember && compareMember
                        ? {
                            primary: viewedMember,
                            compare: compareMember,
                          }
                        : null
                    }
                    myJoinedSidequestsToday={myJoinedSidequestsToday}
                    onEditSidequest={
                      sessionUserOnScreen ? onEditSidequest : undefined
                    }
                    onOpenSpotMap={openSpotMap}
                    hideCoordinateLink={isFestivalDay}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <MapDayDialog
        open={mapDialog.open}
        onOpenChange={(o) =>
          setMapDialog((cur) => (o ? cur : { ...cur, open: false }))
        }
        day={day}
        focusLabel={mapDialog.label}
      />
    </div>
  );
}

/**
 * The dropdown used both for "view someone's day" and the compare
 * partner selector. Pulled out so the two selects in compare mode
 * stay visually consistent and the call-sites stay readable.
 */
function ViewerSelect({
  value,
  members,
  myMemberId,
  displayLabel,
  displayColor,
  onChange,
  ariaLabel,
}: {
  value: string;
  members: Member[];
  myMemberId: Id<"members"> | null;
  displayLabel: string;
  displayColor: string;
  onChange: (id: Id<"members">) => void;
  ariaLabel: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as Id<"members">)}
    >
      <SelectTrigger
        className="h-7 w-auto gap-1.5 rounded-full border-border/50 bg-background/40 px-2 text-[11px]"
        aria-label={ariaLabel}
      >
        <Eye className="size-3 shrink-0 text-muted-foreground" />
        <SelectValue>
          <span className="inline-flex items-center gap-1.5">
            <MemberDot color={displayColor} size="xs" />
            <span className="truncate">{displayLabel}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {members.map((m) => (
          <SelectItem key={m._id} value={m._id}>
            <span className="inline-flex items-center gap-1.5">
              <MemberDot color={m.color} size="xs" />
              <span>
                {m._id === myMemberId ? `${m.name} (you)` : m.name}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EmptyState({
  isViewingSelf,
  isComparing,
  viewedMemberName,
  compareMemberName,
  onCreateSidequest,
  onOpenWalkthrough,
}: {
  isViewingSelf: boolean;
  isComparing: boolean;
  viewedMemberName: string | null;
  compareMemberName: string | null;
  onCreateSidequest?: () => void;
  onOpenWalkthrough?: () => void;
}) {
  const showActions =
    Boolean(onCreateSidequest) || Boolean(onOpenWalkthrough);
  return (
    <div className="pointer-events-none absolute inset-x-3 top-6 rounded-md border border-dashed border-border/50 bg-background/40 px-4 py-6 text-center text-xs leading-relaxed text-muted-foreground">
      <Sparkles className="mx-auto mb-2 size-4 opacity-60" />
      <p className="font-medium text-foreground">
        {isComparing
          ? `Nothing planned by ${viewedMemberName ?? "them"} or ${compareMemberName ?? "them"} yet`
          : isViewingSelf
            ? "Nothing on your day yet"
            : viewedMemberName
              ? `${viewedMemberName} hasn't planned anything yet`
              : "Nothing planned yet"}
      </p>
      <p className="mt-1">
        {isViewingSelf || isComparing
          ? "Add picks on the Schedule view, plan a meetup on Coordinate, or propose a sidequest to fill this in."
          : "Once they pick artists, plan meetups, or RSVP to sidequests, you'll see them here."}
      </p>
      {showActions && (
        <div className="pointer-events-auto mt-3 flex flex-wrap items-center justify-center gap-2">
          {onOpenWalkthrough && (
            <button
              type="button"
              onClick={onOpenWalkthrough}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <Sparkles className="size-3.5" />
              Quick-pick walkthrough
            </button>
          )}
          {onCreateSidequest && (
            <button
              type="button"
              onClick={onCreateSidequest}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-violet-500 px-3 text-xs font-semibold text-white shadow-sm hover:bg-violet-500/90"
            >
              <CalendarPlus className="size-3.5" />
              Create sidequest
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The two members being compared in compare mode. Cards consult this
 * to render owner badges; when null the cards render in their normal
 * single-viewer mode without ownership decoration.
 */
interface CompareContext {
  primary: Member;
  compare: Member;
}

function TimelineCard({
  event,
  membersById,
  selectionsByArtist,
  myMemberId,
  viewedMemberId,
  compareContext,
  myJoinedSidequestsToday,
  onEditSidequest,
  onOpenSpotMap,
  hideCoordinateLink,
}: {
  event: TimelineEvent;
  membersById: Map<string, Member>;
  selectionsByArtist: Map<string, Array<Id<"members">>>;
  myMemberId: Id<"members">;
  /**
   * The member whose day we're showing right now. Used by meetup
   * cards to compute the "others meeting with you" list relative to
   * the viewed perspective rather than the logged-in session.
   */
  viewedMemberId: Id<"members">;
  compareContext: CompareContext | null;
  /** Pre-filtered to the session user, scoped to the visible day. */
  myJoinedSidequestsToday: Sidequest[];
  onEditSidequest?: (sidequest: Sidequest) => void;
  onOpenSpotMap: (label: string) => void;
  hideCoordinateLink: boolean;
}) {
  if (event.kind === "artist") {
    return (
      <ArtistTimelineCard
        artist={event.artist}
        ownerIds={event.ownerIds}
        compareContext={compareContext}
        membersById={membersById}
        selectionsByArtist={selectionsByArtist}
        myMemberId={myMemberId}
        myJoinedSidequestsToday={myJoinedSidequestsToday}
      />
    );
  }
  if (event.kind === "meetup") {
    return (
      <MeetupTimelineCard
        conv={event.conv}
        spot={event.spot}
        membersById={membersById}
        viewedMemberId={viewedMemberId}
        ownerIds={event.ownerIds}
        compareContext={compareContext}
        onOpenSpotMap={onOpenSpotMap}
        hideCoordinateLink={hideCoordinateLink}
      />
    );
  }
  return (
    <SidequestTimelineCard
      sidequest={event.sidequest}
      membersById={membersById}
      myMemberId={myMemberId}
      ownerIds={event.ownerIds}
      compareContext={compareContext}
      onEdit={onEditSidequest}
    />
  );
}

/**
 * In compare mode, return inline-style overrides that tint a card
 * with the owning member's color so it's instantly clear whose slot
 * a card belongs to. When both members own the same event we use a
 * 50/50 diagonal split between their two colors.
 *
 * Hex with `33` alpha (~0.2 opacity) keeps the tint subtle enough
 * for the foreground text to stay legible against a dark surface.
 */
function memberColorTint(
  ownerIds: Array<Id<"members">>,
  compareContext: CompareContext | null,
): { backgroundColor?: string; backgroundImage?: string } | null {
  if (!compareContext) return null;
  const ownsPrimary = ownerIds.includes(compareContext.primary._id);
  const ownsCompare = ownerIds.includes(compareContext.compare._id);
  if (!ownsPrimary && !ownsCompare) return null;
  if (ownsPrimary && ownsCompare) {
    const a = compareContext.primary.color;
    const b = compareContext.compare.color;
    return {
      backgroundColor: "transparent",
      backgroundImage: `linear-gradient(135deg, ${a}33 0%, ${a}33 50%, ${b}33 50%, ${b}33 100%)`,
    };
  }
  const owner = ownsPrimary ? compareContext.primary : compareContext.compare;
  return { backgroundColor: `${owner.color}33` };
}

/**
 * Compare-mode "whose card is this" tag. Rendered as its own row
 * inside each timeline card so the full owner name is readable —
 * the previous top-right "two dots" treatment was too easy to miss
 * and didn't fit a name. Single-owner shows `[dot] Alice`; shared
 * events show `[dot][dot] Both` (with both color dots so colors
 * still match the cards' tint).
 *
 * Returns `null` when the event isn't owned by either compared
 * member or when there's no compare context — single-viewer mode
 * doesn't need an ownership label.
 */
function OwnerBadges({
  ownerIds,
  compareContext,
}: {
  ownerIds: Array<Id<"members">>;
  compareContext: CompareContext | null;
}) {
  if (!compareContext) return null;
  const ownsPrimary = ownerIds.includes(compareContext.primary._id);
  const ownsCompare = ownerIds.includes(compareContext.compare._id);
  if (!ownsPrimary && !ownsCompare) return null;
  const both = ownsPrimary && ownsCompare;
  const label = both
    ? "Both"
    : ownsPrimary
      ? compareContext.primary.name
      : compareContext.compare.name;
  const titleParts: string[] = [];
  if (ownsPrimary) titleParts.push(compareContext.primary.name);
  if (ownsCompare) titleParts.push(compareContext.compare.name);
  return (
    <span
      className="pointer-events-none flex w-full min-w-0 items-center gap-1 rounded-full bg-background/70 px-1.5 py-px text-[10px] font-medium text-foreground ring-1 ring-border/50 backdrop-blur-sm"
      title={
        both ? `Shared with ${titleParts.join(" + ")}` : titleParts.join(" + ")
      }
      aria-label={
        both
          ? `Shared with ${titleParts.join(" and ")}`
          : `Only ${titleParts.join(" and ")}`
      }
    >
      <span className="flex shrink-0 items-center gap-0.5">
        {ownsPrimary && (
          <span
            className="size-1.5 rounded-full ring-1 ring-background/40"
            style={{ backgroundColor: compareContext.primary.color }}
          />
        )}
        {ownsCompare && (
          <span
            className="size-1.5 rounded-full ring-1 ring-background/40"
            style={{ backgroundColor: compareContext.compare.color }}
          />
        )}
      </span>
      <span className="truncate leading-none">{label}</span>
    </span>
  );
}

function ArtistTimelineCard({
  artist,
  ownerIds,
  compareContext,
  membersById,
  selectionsByArtist,
  myMemberId,
  myJoinedSidequestsToday,
}: {
  artist: Artist;
  ownerIds: Array<Id<"members">>;
  compareContext: CompareContext | null;
  membersById: Map<string, Member>;
  selectionsByArtist: Map<string, Array<Id<"members">>>;
  myMemberId: Id<"members">;
  myJoinedSidequestsToday: Sidequest[];
}) {
  const palette = getStagePalette(artist.stage);
  const toggle = useMutation(api.memberSelections.toggle);
  const offline = useIsOffline();
  const [busy, setBusy] = useState(false);

  // The session user can only remove a pick they actually own. In
  // compare mode the card may be visible because a friend picked it
  // (ownerIds = [friend]); in that case the popover stays read-only.
  const youOwn = ownerIds.includes(myMemberId);

  const pickedIds = selectionsByArtist.get(artist._id) ?? [];
  const allAttendees = pickedIds
    .map((id) => {
      const m = membersById.get(id);
      if (!m) return null;
      return { id, member: m, isYou: id === myMemberId };
    })
    .filter(
      (
        x,
      ): x is {
        id: Id<"members">;
        member: Member;
        isYou: boolean;
      } => x !== null,
    );

  // Joined sidequests whose interval intersects this set's time.
  // Same half-open check used elsewhere so a quest ending exactly
  // when the set starts isn't surfaced as a conflict.
  const overlappingSidequests = myJoinedSidequestsToday.filter(
    (sq) => sq.startMs < artist.endMs && sq.endMs > artist.startMs,
  );

  async function handleRemove() {
    if (busy || offline || !youOwn) return;
    setBusy(true);
    try {
      // `toggle` is a single mutation that removes the selection if
      // it exists; safer than a dedicated remove because we can't
      // race with a concurrent re-pick on the same client.
      await toggle({ memberId: myMemberId, artistId: artist._id });
    } finally {
      setBusy(false);
    }
  }

  // In compare mode the background is tinted with the owning
  // member's color so it's obvious whose slot it is at a glance;
  // the stage palette stays on the left border so the stage info
  // isn't lost.
  const tint = memberColorTint(ownerIds, compareContext);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-md border-l-[3px] px-2 py-1.5 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            backgroundColor:
              tint?.backgroundColor ?? `rgb(${palette.rgb} / 0.18)`,
            backgroundImage: tint?.backgroundImage,
            borderColor: `rgb(${palette.rgb})`,
            color: "rgb(229 231 235)",
          }}
          aria-label={`${artist.name} on ${artist.stage} — view details`}
        >
          <OwnerBadges ownerIds={ownerIds} compareContext={compareContext} />
          <span className="truncate text-xs font-semibold leading-tight">
            {artist.name}
          </span>
          <span
            className="inline-flex w-fit items-center gap-1 truncate text-[10px] font-medium"
            style={{ color: `rgb(${palette.rgb})` }}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: `rgb(${palette.rgb})` }}
            />
            <span className="truncate">{artist.stage}</span>
          </span>
          <span className="mt-auto text-[10px] tabular-nums text-muted-foreground">
            {formatTime(artist.startMs)} – {formatTime(artist.endMs)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div className="space-y-1.5">
          <div
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: `rgb(${palette.rgb} / 0.25)`,
              color: `rgb(${palette.rgb})`,
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: `rgb(${palette.rgb})` }}
            />
            {artist.stage}
          </div>
          <h3 className="text-sm font-semibold leading-tight">{artist.name}</h3>
          <div className="flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
            <Clock className="size-3" />
            {formatTime(artist.startMs)} – {formatTime(artist.endMs)}
          </div>
        </div>

        {overlappingSidequests.length > 0 && (
          <div className="flex flex-col gap-0.5 rounded-md bg-amber-500/15 px-2 py-1.5 text-[11px] font-medium text-amber-200 ring-1 ring-amber-500/40">
            <span className="flex items-center gap-1 text-[9px] uppercase tracking-wide opacity-80">
              <AlertTriangle className="size-3 shrink-0" />
              Sidequest at this time
            </span>
            <span className="flex w-full min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
              <span className="truncate font-semibold text-violet-200">
                {overlappingSidequests[0].title}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums opacity-80">
                {formatTime(overlappingSidequests[0].startMs)}–
                {formatTime(overlappingSidequests[0].endMs)}
              </span>
              {overlappingSidequests.length > 1 && (
                <span className="shrink-0 rounded-full bg-amber-500/30 px-1 text-[9px] font-semibold text-amber-100 ring-1 ring-amber-500/50">
                  +{overlappingSidequests.length - 1}
                </span>
              )}
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {allAttendees.length === 0 ? "No picks yet" : "Going"}
          </div>
          {allAttendees.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {allAttendees.map(({ id, member, isYou }) => (
                <MemberChip
                  key={id}
                  name={member.name}
                  color={member.color}
                  size="xs"
                  isYou={isYou}
                  truncate
                />
              ))}
            </div>
          )}
        </div>

        {youOwn && (
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={busy || offline}
            title={
              offline
                ? "Offline — reconnect to remove"
                : "Remove this pick from your day"
            }
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-destructive/50 bg-destructive/10 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Remove pick
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MeetupTimelineCard({
  conv,
  spot,
  membersById,
  viewedMemberId,
  ownerIds,
  compareContext,
  onOpenSpotMap,
  hideCoordinateLink,
}: {
  conv: Convergence;
  spot: Doc<"meetups"> | undefined;
  membersById: Map<string, Member>;
  /** Whose perspective we're rendering — used to filter "others". */
  viewedMemberId: Id<"members">;
  ownerIds: Array<Id<"members">>;
  compareContext: CompareContext | null;
  onOpenSpotMap: (label: string) => void;
  hideCoordinateLink: boolean;
}) {
  const palette = getStagePalette(conv.destinationStage);
  // In compare mode "others" is everyone in the convergence besides
  // the two compared members, so the chips don't redundantly echo the
  // members already called out in the OwnerBadges. In single mode we
  // keep the existing behaviour (everyone but the viewed member).
  const excluded = new Set<string>(
    compareContext
      ? [compareContext.primary._id, compareContext.compare._id]
      : [viewedMemberId],
  );
  const others = conv.memberIds
    .filter((id) => !excluded.has(id))
    .map((id) => membersById.get(id))
    .filter((m): m is Member => Boolean(m));
  const focusKey = meetupKey(
    conv.day,
    conv.windowStart,
    conv.windowEnd,
    conv.destinationStage,
  );
  const coordinateHref = `/coordinate?focus=${encodeURIComponent(focusKey)}`;
  const meetStart = spot?.meetMs ?? null;
  const meetEnd = spot?.meetEndMs ?? null;
  const hasMeetRange =
    meetStart !== null && meetEnd !== null && meetEnd > meetStart;
  const primaryTimeLabel = hasMeetRange
    ? `${formatTime(meetStart!)} – ${formatTime(meetEnd!)}`
    : meetStart !== null
      ? `Gather ${formatTime(meetStart)}`
      : formatRange(conv.windowStart, conv.windowEnd);

  // In compare mode the green meetup tint gives way to the owning
  // member's color so the visual signal "whose slot is this" wins
  // over the type-color. The Users icon + "Meetup" label inside the
  // card still indicates type, so we don't lose that info.
  const tint = memberColorTint(ownerIds, compareContext);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-md border border-emerald-500/40 px-2 py-1.5 text-left text-[11px] text-emerald-50 transition-colors hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !tint && "bg-emerald-500/15",
          )}
          style={
            tint
              ? {
                  backgroundColor: tint.backgroundColor,
                  backgroundImage: tint.backgroundImage,
                }
              : undefined
          }
          aria-label={`Meetup heading to ${conv.destinationArtist.name}`}
        >
          <OwnerBadges ownerIds={ownerIds} compareContext={compareContext} />
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-300">
            <Users className="size-2.5" />
            Meetup
          </span>
          <span className="truncate text-xs font-semibold leading-tight">
            {spot?.label ?? "Pick a spot"}
          </span>
          <span
            className="inline-flex w-fit items-center gap-1 truncate text-[10px]"
            style={{ color: `rgb(${palette.rgb})` }}
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: `rgb(${palette.rgb})` }}
            />
            <span className="truncate">→ {conv.destinationArtist.name}</span>
          </span>
          <span className="mt-auto inline-flex items-center gap-1 text-[10px] tabular-nums text-emerald-200/90">
            <Clock className="size-2.5" />
            {primaryTimeLabel}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            <Users className="size-3" />
            Meetup
          </div>
          <h3 className="text-sm font-semibold leading-tight">
            {spot?.label ?? "No spot picked yet"}
          </h3>
          <div className="flex items-baseline gap-1.5 text-[11px] tabular-nums">
            <span className="font-semibold text-emerald-200">
              {primaryTimeLabel}
            </span>
            {meetStart !== null && (
              <span className="text-[10px] text-muted-foreground">
                · available {formatRange(conv.windowStart, conv.windowEnd)}
              </span>
            )}
          </div>
        </div>

        <div
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
          style={{
            backgroundColor: `rgb(${palette.rgb} / 0.12)`,
            color: `rgb(${palette.rgb})`,
          }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: `rgb(${palette.rgb})` }}
          />
          <span className="font-semibold">{conv.destinationArtist.name}</span>
          <span className="opacity-80">· {conv.destinationStage}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {spot?.label ? (
            <button
              type="button"
              onClick={() => onOpenSpotMap(spot.label as string)}
              title={`View ${spot.label} on the map`}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-200 ring-1 ring-emerald-500/40 transition-colors hover:bg-emerald-500/25"
            >
              <MapPin className="size-3" />
              {spot.label}
            </button>
          ) : (
            <div className="inline-flex items-center gap-1 rounded-md border border-dashed border-border/60 px-2 py-1 text-[11px] text-muted-foreground">
              <MapPin className="size-3" />
              No spot picked yet
            </div>
          )}
          {meetStart !== null && (
            <div className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium tabular-nums text-emerald-200 ring-1 ring-emerald-500/40">
              <Clock className="size-3" />
              {hasMeetRange
                ? `${formatTime(meetStart)} – ${formatTime(meetEnd!)}`
                : formatTime(meetStart)}
            </div>
          )}
        </div>

        {others.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              With
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {others.map((m) => (
                <MemberChip
                  key={m._id}
                  name={m.name}
                  color={m.color}
                  size="xs"
                  truncate
                />
              ))}
            </div>
          </div>
        )}

        {!hideCoordinateLink && (
          <Link
            to={coordinateHref}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border/60 bg-card/40 text-xs font-medium hover:bg-card/60"
          >
            <MapPin className="size-3.5" />
            Open Coordinate
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}

function SidequestTimelineCard({
  sidequest,
  membersById,
  myMemberId,
  ownerIds,
  compareContext,
  onEdit,
}: {
  sidequest: Sidequest;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  ownerIds: Array<Id<"members">>;
  compareContext: CompareContext | null;
  onEdit?: (sidequest: Sidequest) => void;
}) {
  const creator = membersById.get(sidequest.createdByMemberId);
  const accent = creator?.color ?? "#a78bfa";

  const orderedDots = useMemo(() => {
    const out: Member[] = [];
    for (const id of sidequest.participantMemberIds) {
      const m = membersById.get(id);
      if (m) out.push(m);
    }
    out.sort((a, b) => {
      if (a._id === sidequest.createdByMemberId) return -1;
      if (b._id === sidequest.createdByMemberId) return 1;
      return 0;
    });
    return out;
  }, [sidequest.participantMemberIds, sidequest.createdByMemberId, membersById]);

  const visibleDots = orderedDots.slice(0, 4);
  const overflow = orderedDots.length - visibleDots.length;

  // Member-color tint takes over from the violet sidequest tint in
  // compare mode (the UserPlus icon + "Sidequest" label still
  // indicate type). Creator's accent stays on the left border so
  // the "who proposed it" signal is preserved.
  const tint = memberColorTint(ownerIds, compareContext);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-md border border-violet-500/30 px-2 py-1.5 text-left text-[11px] text-violet-50 transition-colors hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !tint && "bg-violet-500/10",
          )}
          style={{
            borderLeft: `3px solid ${accent}`,
            backgroundColor: tint?.backgroundColor,
            backgroundImage: tint?.backgroundImage,
          }}
          aria-label={`Sidequest: ${sidequest.title}`}
        >
          <OwnerBadges ownerIds={ownerIds} compareContext={compareContext} />
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-violet-300">
            <UserPlus className="size-2.5" />
            Sidequest
          </span>
          <span className="truncate text-xs font-semibold leading-tight">
            {sidequest.title}
          </span>
          {sidequest.location && (
            <span className="flex items-center gap-1 truncate text-[10px] text-violet-200/80">
              <MapPin className="size-2.5 shrink-0" />
              <span className="truncate">{sidequest.location}</span>
            </span>
          )}
          <span className="mt-auto flex items-center justify-between gap-1 text-[10px] tabular-nums text-violet-200/80">
            <span>{formatRange(sidequest.startMs, sidequest.endMs)}</span>
            {orderedDots.length > 0 && (
              <span className="flex items-center gap-0.5">
                {visibleDots.map((m) => (
                  <span
                    key={m._id}
                    title={m.name}
                    className="inline-flex"
                    aria-hidden
                  >
                    <MemberDot color={m.color} size="xs" />
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="text-[9px] text-violet-200/80">
                    +{overflow}
                  </span>
                )}
              </span>
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <SidequestPopover
          sidequest={sidequest}
          membersById={membersById}
          myMemberId={myMemberId}
          onEdit={onEdit}
        />
      </PopoverContent>
    </Popover>
  );
}
