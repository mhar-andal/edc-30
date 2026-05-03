import { BUFFER_MS, type DayKey } from "./time";
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

export interface Convergence {
  memberAId: Id<"members">;
  memberBId: Id<"members">;
  windowStart: number;
  windowEnd: number;
  bufferA: BufferWindow;
  bufferB: BufferWindow;
}

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

/**
 * A convergence requires that the two members are heading to the SAME next
 * stage but coming FROM different stages (treating "outside the festival" as
 * its own distinct origin for pre-day buffers). End-of-day post buffers (no
 * toArtist) never qualify because there is no shared next stage.
 */
function isMeetupCompatible(ba: BufferWindow, bb: BufferWindow): boolean {
  if (!ba.toArtist || !bb.toArtist) return false;
  if (ba.toArtist.stage !== bb.toArtist.stage) return false;
  const fromA = ba.fromArtist?.stage ?? "__outside";
  const fromB = bb.fromArtist?.stage ?? "__outside";
  if (fromA === fromB) return false;
  return true;
}

export function findConvergences(
  journeys: MemberJourney[],
): Convergence[] {
  const out: Convergence[] = [];
  for (let i = 0; i < journeys.length; i++) {
    for (let j = i + 1; j < journeys.length; j++) {
      const a = journeys[i];
      const b = journeys[j];
      for (const ba of a.buffers) {
        for (const bb of b.buffers) {
          const start = Math.max(ba.start, bb.start);
          const end = Math.min(ba.end, bb.end);
          if (end <= start) continue;
          if (!isMeetupCompatible(ba, bb)) continue;
          const [aId, bId] =
            a.memberId < b.memberId
              ? [a.memberId, b.memberId]
              : [b.memberId, a.memberId];
          const [bufA, bufB] =
            a.memberId < b.memberId ? [ba, bb] : [bb, ba];
          out.push({
            memberAId: aId,
            memberBId: bId,
            windowStart: start,
            windowEnd: end,
            bufferA: bufA,
            bufferB: bufB,
          });
        }
      }
    }
  }
  return out.sort((x, y) => x.windowStart - y.windowStart);
}

export function suggestMeetupStage(
  bufferA: BufferWindow,
  bufferB: BufferWindow,
): string | undefined {
  if (
    bufferA.toArtist &&
    bufferB.toArtist &&
    bufferA.toArtist.stage === bufferB.toArtist.stage
  ) {
    return bufferA.toArtist.stage;
  }
  return undefined;
}

export function meetupKey(
  day: DayKey,
  windowStart: number,
  windowEnd: number,
  memberAId: Id<"members">,
  memberBId: Id<"members">,
): string {
  const [a, b] =
    memberAId < memberBId ? [memberAId, memberBId] : [memberBId, memberAId];
  return `${day}|${windowStart}|${windowEnd}|${a}|${b}`;
}

export interface ConvergenceContext {
  fromArtistA: Artist | null;
  fromArtistB: Artist | null;
  toArtist: Artist | null;
}

/**
 * Given a saved meetup and the relevant per-member journeys, derives the
 * concrete artists involved: where each side is coming from and the shared
 * destination they're both heading to.
 */
export function deriveConvergenceContext(
  meetup: Doc<"meetups">,
  journeyA: MemberJourney | null,
  journeyB: MemberJourney | null,
): ConvergenceContext {
  function findBuffer(j: MemberJourney | null): BufferWindow | null {
    if (!j) return null;
    return (
      j.buffers.find(
        (b) => Math.abs(b.end - meetup.windowEndMs) < 60_000,
      ) ?? null
    );
  }
  const a = findBuffer(journeyA);
  const b = findBuffer(journeyB);
  return {
    fromArtistA: a?.fromArtist ?? null,
    fromArtistB: b?.fromArtist ?? null,
    toArtist: a?.toArtist ?? b?.toArtist ?? null,
  };
}

export function findOrphanedMeetups(
  meetups: Doc<"meetups">[],
  liveKeys: Set<string>,
): Doc<"meetups">[] {
  return meetups
    .filter(
      (m) =>
        !liveKeys.has(
          meetupKey(m.day, m.windowStartMs, m.windowEndMs, m.memberAId, m.memberBId),
        ),
    )
    .sort((a, b) => a.windowStartMs - b.windowStartMs);
}
