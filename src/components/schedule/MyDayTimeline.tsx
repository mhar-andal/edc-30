import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  CalendarPlus,
  Clock,
  MapPin,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MemberChip } from "@/components/MemberChip";
import { MemberDot } from "@/components/MemberDot";
import { SidequestPopover } from "@/components/sidequests/SidequestPopover";
import { getStagePalette } from "@/lib/colors";
import {
  FESTIVAL_DAY_RANGE_MS,
  FESTIVAL_DAY_HOURS,
  formatHour,
  formatRange,
  formatTime,
  type DayKey,
} from "@/lib/time";
import {
  buildJourney,
  findConvergences,
  meetupKey,
  type Convergence,
} from "@/lib/coordinate";
import { useCachedQuery } from "@/lib/useCachedQuery";
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

  const events = useMemo<TimelineEvent[]>(() => {
    if (!myMemberId) return [];
    const out: TimelineEvent[] = [];

    const myPicks = data.selectionsByMember.get(myMemberId);
    if (myPicks && myPicks.size > 0) {
      const dayArtists = data.artistsByDay.get(day) ?? [];
      for (const a of dayArtists) {
        if (myPicks.has(a._id)) {
          out.push({
            id: `artist:${a._id}`,
            kind: "artist",
            startMs: a.startMs,
            endMs: a.endMs,
            artist: a,
          });
        }
      }
    }

    const dayQuests = data.sidequestsByDay.get(day) ?? [];
    for (const sq of dayQuests) {
      if (sq.participantMemberIds.some((id) => id === myMemberId)) {
        out.push({
          id: `sidequest:${sq._id}`,
          kind: "sidequest",
          startMs: sq.startMs,
          endMs: sq.endMs,
          sidequest: sq,
        });
      }
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
      if (!conv.memberIds.includes(myMemberId)) continue;
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
      });
    }

    out.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    return out;
  }, [day, data, myMemberId, allMeetups]);

  const placed = useMemo(() => layoutEvents(events), [events]);
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
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Your day
        </span>
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
                onCreateSidequest={onCreateSidequest}
                onOpenWalkthrough={onOpenWalkthrough}
              />
            )}

            {placed.map(({ event, lane, totalLanes }) => {
              const top = Math.max(0, msToPx(event.startMs));
              const bottom = Math.max(top + MIN_EVENT_HEIGHT_PX, msToPx(event.endMs));
              const height = bottom - top;
              const widthPct = 100 / totalLanes;
              const leftPct = widthPct * lane;
              return (
                <div
                  key={event.id}
                  className="absolute px-1"
                  style={{
                    top,
                    height,
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                  }}
                >
                  <TimelineCard
                    event={event}
                    membersById={data.membersById}
                    myMemberId={myMemberId}
                    onEditSidequest={onEditSidequest}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  onCreateSidequest,
  onOpenWalkthrough,
}: {
  onCreateSidequest?: () => void;
  onOpenWalkthrough?: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-6 rounded-md border border-dashed border-border/50 bg-background/40 px-4 py-6 text-center text-xs leading-relaxed text-muted-foreground">
      <Sparkles className="mx-auto mb-2 size-4 opacity-60" />
      <p className="font-medium text-foreground">
        Nothing on your day yet
      </p>
      <p className="mt-1">
        Add picks on the Schedule view, plan a meetup on Coordinate, or
        propose a sidequest to fill this in.
      </p>
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
    </div>
  );
}

function TimelineCard({
  event,
  membersById,
  myMemberId,
  onEditSidequest,
}: {
  event: TimelineEvent;
  membersById: Map<string, Member>;
  myMemberId: Id<"members">;
  onEditSidequest?: (sidequest: Sidequest) => void;
}) {
  if (event.kind === "artist") {
    return <ArtistTimelineCard artist={event.artist} />;
  }
  if (event.kind === "meetup") {
    return (
      <MeetupTimelineCard
        conv={event.conv}
        spot={event.spot}
        membersById={membersById}
        myMemberId={myMemberId}
      />
    );
  }
  return (
    <SidequestTimelineCard
      sidequest={event.sidequest}
      membersById={membersById}
      myMemberId={myMemberId}
      onEdit={onEditSidequest}
    />
  );
}

function ArtistTimelineCard({ artist }: { artist: Artist }) {
  const palette = getStagePalette(artist.stage);
  return (
    <div
      className="flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-md border-l-[3px] px-2 py-1.5 text-left text-[11px]"
      style={{
        backgroundColor: `rgb(${palette.rgb} / 0.18)`,
        borderColor: `rgb(${palette.rgb})`,
        color: "rgb(229 231 235)",
      }}
    >
      <div className="flex items-baseline justify-between gap-1.5">
        <span className="truncate text-xs font-semibold leading-tight">
          {artist.name}
        </span>
      </div>
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
    </div>
  );
}

function MeetupTimelineCard({
  conv,
  spot,
  membersById,
  myMemberId,
}: {
  conv: Convergence;
  spot: Doc<"meetups"> | undefined;
  membersById: Map<string, Member>;
  myMemberId: Id<"members">;
}) {
  const palette = getStagePalette(conv.destinationStage);
  const others = conv.memberIds
    .filter((id) => id !== myMemberId)
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-1.5 text-left text-[11px] text-emerald-50 transition-colors hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={`Meetup heading to ${conv.destinationArtist.name}`}
        >
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
            <div className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-200 ring-1 ring-emerald-500/40">
              <MapPin className="size-3" />
              {spot.label}
            </div>
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

        <Link
          to={coordinateHref}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border/60 bg-card/40 text-xs font-medium hover:bg-card/60"
        >
          <MapPin className="size-3.5" />
          Open Coordinate
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function SidequestTimelineCard({
  sidequest,
  membersById,
  myMemberId,
  onEdit,
}: {
  sidequest: Sidequest;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1.5 text-left text-[11px] text-violet-50 transition-colors hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ borderLeft: `3px solid ${accent}` }}
          aria-label={`Sidequest: ${sidequest.title}`}
        >
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
