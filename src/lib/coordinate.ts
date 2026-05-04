import { BUFFER_MS, MAX_BUFFER_GAP_MS, type DayKey } from "./time";
import type { Id, Doc } from "../../convex/_generated/dataModel";
import type { Artist } from "./useScheduleData";

export interface BufferWindow {
  start: number;
  end: number;
  fromArtist: Artist | null;
  toArtist: Artist | null;
  kind: "between" | "pre" | "post";
}

export interface MemberJourney {
  memberId: Id<"members">;
  artists: Artist[];
  buffers: BufferWindow[];
}

/**
 * A convergence is a group of 2+ members heading to the same
 * destination stage with mutually overlapping buffer windows, where
 * at least 2 distinct origin stages are represented.
 *
 * Convergences are computed live from current selections — they are
 * never persisted. A meetup, when created, is pinned to the
 * convergence by `(day, windowStart, windowEnd, destinationStage)`.
 */
export interface Convergence {
  day: DayKey;
  windowStart: number;
  windowEnd: number;
  destinationStage: string;
  destinationArtist: Artist;
  /** Per-member buffer details (where each one is coming from). */
  byMember: Map<Id<"members">, BufferWindow>;
  /** Sorted list of member ids participating in this convergence. */
  memberIds: Id<"members">[];
}

const OUTSIDE_ORIGIN = "__outside";

export function buildJourney(
  memberId: Id<"members">,
  day: DayKey,
  selectedArtistIds: Set<string>,
  artistsByDay: Map<DayKey, Artist[]>,
): MemberJourney {
  const dayArtists = artistsByDay.get(day) ?? [];
  const artists = dayArtists
    .filter((a) => selectedArtistIds.has(a._id))
    .sort((a, b) => a.startMs - b.startMs);

  const buffers: BufferWindow[] = [];
  if (artists.length === 0) {
    return { memberId, artists: [], buffers: [] };
  }

  buffers.push({
    start: artists[0].startMs - BUFFER_MS,
    end: artists[0].startMs,
    fromArtist: null,
    toArtist: artists[0],
    kind: "pre",
  });
  for (let i = 0; i < artists.length - 1; i++) {
    const a = artists[i];
    const b = artists[i + 1];
    // Skip gap-spanning "between" buffers. If the time between two
    // consecutive picks is larger than MAX_BUFFER_GAP_MS, we treat
    // that as the user skipping a slot, not transitioning between
    // back-to-back sets.
    const gap = b.startMs - a.endMs;
    if (gap > MAX_BUFFER_GAP_MS) continue;
    const start = a.endMs - BUFFER_MS;
    const end = b.startMs + BUFFER_MS;
    if (end > start) {
      buffers.push({ start, end, fromArtist: a, toArtist: b, kind: "between" });
    }
  }
  const last = artists[artists.length - 1];
  buffers.push({
    start: last.endMs,
    end: last.endMs + BUFFER_MS,
    fromArtist: last,
    toArtist: null,
    kind: "post",
  });

  return { memberId, artists, buffers };
}

interface BufferEntry {
  memberId: Id<"members">;
  buffer: BufferWindow;
}

interface SweepEvent {
  time: number;
  type: "enter" | "exit";
  entry: BufferEntry;
}

/**
 * Active-set sweep per destination stage. We emit one Convergence per
 * maximal contiguous period where ≥2 people from ≥2 distinct origin
 * stages are converging on the same destination. People joining or
 * leaving DURING such a period are accumulated into the same
 * convergence — we don't fragment into multiple cards each time
 * the active set changes. The window is the full qualifying interval
 * (first moment ≥2/≥2 was met → last moment it was still met), and
 * the listed members are everyone who was active at any point.
 */
export function findConvergences(
  journeys: MemberJourney[],
  day: DayKey,
): Convergence[] {
  const byStage = new Map<string, BufferEntry[]>();
  for (const j of journeys) {
    for (const buffer of j.buffers) {
      if (!buffer.toArtist) continue;
      const arr = byStage.get(buffer.toArtist.stage) ?? [];
      arr.push({ memberId: j.memberId, buffer });
      byStage.set(buffer.toArtist.stage, arr);
    }
  }

  const convergences: Convergence[] = [];

  for (const [stage, entries] of byStage) {
    const events: SweepEvent[] = [];
    for (const entry of entries) {
      events.push({ time: entry.buffer.start, type: "enter", entry });
      events.push({ time: entry.buffer.end, type: "exit", entry });
    }
    // 'enter' before 'exit' at the same instant so back-to-back
    // intervals are treated as overlapping at the boundary.
    events.sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time;
      if (a.type !== b.type) return a.type === "enter" ? -1 : 1;
      return 0;
    });

    const active = new Map<Id<"members">, BufferWindow>();
    let segmentStart: number | null = null;
    // Union of every member who was active at any point during the
    // currently-open qualifying segment. Used as the convergence's
    // member roster on emit.
    let segmentUnion: Map<Id<"members">, BufferWindow> | null = null;

    function qualifies(set: Map<Id<"members">, BufferWindow>): boolean {
      if (set.size < 2) return false;
      const origins = new Set<string>();
      for (const buf of set.values()) {
        origins.add(buf.fromArtist?.stage ?? OUTSIDE_ORIGIN);
      }
      return origins.size >= 2;
    }

    function emit(end: number) {
      if (segmentStart === null || segmentUnion === null) return;
      if (end <= segmentStart) return;
      let destinationArtist: Artist | null = null;
      for (const buf of segmentUnion.values()) {
        if (buf.toArtist) {
          destinationArtist = buf.toArtist;
          break;
        }
      }
      if (!destinationArtist) return;
      const ids = Array.from(segmentUnion.keys()).sort();
      convergences.push({
        day,
        windowStart: segmentStart,
        windowEnd: end,
        destinationStage: stage,
        destinationArtist,
        byMember: new Map(segmentUnion),
        memberIds: ids,
      });
    }

    for (const ev of events) {
      const wasQualifying = segmentStart !== null;

      // Apply event.
      if (ev.type === "enter") {
        active.set(ev.entry.memberId, ev.entry.buffer);
      } else if (active.get(ev.entry.memberId) === ev.entry.buffer) {
        // Only delete if this exact buffer is still active
        // (a later enter for the same member may have replaced it).
        active.delete(ev.entry.memberId);
      }

      const isQualifying = qualifies(active);

      if (!wasQualifying && isQualifying) {
        // Just became qualifying — open a new segment.
        segmentStart = ev.time;
        segmentUnion = new Map(active);
      } else if (wasQualifying && isQualifying) {
        // Still qualifying — accumulate any new active members into
        // the union (a leave doesn't remove them from the segment
        // roster; they were part of the meetup while present).
        for (const [id, buf] of active) {
          if (!segmentUnion!.has(id)) segmentUnion!.set(id, buf);
        }
      } else if (wasQualifying && !isQualifying) {
        // Just dropped below qualifying — emit the segment.
        emit(ev.time);
        segmentStart = null;
        segmentUnion = null;
      }
    }
  }

  return convergences.sort((a, b) => a.windowStart - b.windowStart);
}

export function suggestMeetupStage(conv: Convergence): string {
  return conv.destinationStage;
}

export function meetupKey(
  day: DayKey,
  windowStart: number,
  windowEnd: number,
  destinationStage: string,
): string {
  return `${day}|${windowStart}|${windowEnd}|${destinationStage}`;
}

/**
 * Resolve a saved meetup back to the live convergence (if any) so the
 * UI can show currently-participating members.
 */
export function findConvergenceForMeetup(
  meetup: Doc<"meetups">,
  convergences: Convergence[],
): Convergence | null {
  const targetKey = meetupKey(
    meetup.day,
    meetup.windowStartMs,
    meetup.windowEndMs,
    meetup.destinationStage,
  );
  for (const c of convergences) {
    const k = meetupKey(c.day, c.windowStart, c.windowEnd, c.destinationStage);
    if (k === targetKey) return c;
  }
  return null;
}
