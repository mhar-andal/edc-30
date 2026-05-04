import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id, Doc } from "../../convex/_generated/dataModel";
import { useCachedQuery } from "./useCachedQuery";
import type { DayKey } from "./time";
import { useMemberSession } from "./useMemberSession";

export type Artist = Doc<"artists">;
export type Member = Doc<"members">;
export type Sidequest = Doc<"sidequests"> & {
  participantMemberIds: Array<Id<"members">>;
};

export interface ScheduleData {
  loading: boolean;
  artists: Artist[];
  members: Member[];
  selectionsByMember: Map<string, Set<string>>;
  selectionsByArtist: Map<string, Array<Id<"members">>>;
  artistsByDay: Map<DayKey, Artist[]>;
  artistsById: Map<string, Artist>;
  membersById: Map<string, Member>;
  sidequests: Sidequest[];
  sidequestsByDay: Map<DayKey, Sidequest[]>;
  /**
   * For the current device's member, maps an artistId to the set of THEIR
   * already-picked artists that overlap on a different stage. Used to flag
   * "you'd have to leave one early to catch this" on the Schedule.
   */
  myOverlapsByArtist: Map<string, Artist[]>;
}

export function useScheduleData(): ScheduleData {
  const artists = useCachedQuery(api.artists.listAll);
  const members = useCachedQuery(api.members.list);
  const selections = useCachedQuery(api.memberSelections.listAll);
  const sidequests = useCachedQuery(api.sidequests.listAll);
  const session = useMemberSession();
  const myMemberId = session.status === "authed" ? session.memberId : null;

  return useMemo<ScheduleData>(() => {
    const artistsArr: Artist[] = artists ?? [];
    const membersArr: Member[] = members ?? [];
    const selsArr = selections ?? [];
    const sidequestsArr: Sidequest[] = sidequests ?? [];

    const selectionsByMember = new Map<string, Set<string>>();
    const selectionsByArtist = new Map<string, Array<Id<"members">>>();
    for (const sel of selsArr) {
      const set = selectionsByMember.get(sel.memberId) ?? new Set<string>();
      set.add(sel.artistId);
      selectionsByMember.set(sel.memberId, set);

      const arr = selectionsByArtist.get(sel.artistId) ?? [];
      arr.push(sel.memberId);
      selectionsByArtist.set(sel.artistId, arr);
    }

    const artistsByDay = new Map<DayKey, Artist[]>([
      ["day_1", []],
      ["day_2", []],
      ["day_3", []],
    ]);
    for (const a of artistsArr) {
      const arr = artistsByDay.get(a.day) ?? [];
      arr.push(a);
      artistsByDay.set(a.day, arr);
    }
    for (const arr of artistsByDay.values()) {
      arr.sort((a, b) => a.startMs - b.startMs);
    }

    const artistsById = new Map<string, Artist>();
    for (const a of artistsArr) artistsById.set(a._id, a);

    const membersById = new Map<string, Member>();
    for (const m of membersArr) membersById.set(m._id, m);

    const myOverlapsByArtist = new Map<string, Artist[]>();
    if (myMemberId) {
      const mine = selectionsByMember.get(myMemberId);
      if (mine && mine.size > 0) {
        const myPicks = artistsArr.filter((a) => mine.has(a._id));
        for (const candidate of artistsArr) {
          for (const pick of myPicks) {
            if (candidate._id === pick._id) continue;
            if (candidate.stage === pick.stage) continue;
            if (
              candidate.startMs < pick.endMs &&
              candidate.endMs > pick.startMs
            ) {
              const arr = myOverlapsByArtist.get(candidate._id) ?? [];
              arr.push(pick);
              myOverlapsByArtist.set(candidate._id, arr);
            }
          }
        }
        for (const arr of myOverlapsByArtist.values()) {
          arr.sort((a, b) => a.startMs - b.startMs);
        }
      }
    }

    const sidequestsByDay = new Map<DayKey, Sidequest[]>([
      ["day_1", []],
      ["day_2", []],
      ["day_3", []],
    ]);
    for (const sq of sidequestsArr) {
      const arr = sidequestsByDay.get(sq.day) ?? [];
      arr.push(sq);
      sidequestsByDay.set(sq.day, arr);
    }
    for (const arr of sidequestsByDay.values()) {
      arr.sort((a, b) => a.startMs - b.startMs);
    }

    return {
      loading:
        artists === undefined ||
        members === undefined ||
        selections === undefined ||
        sidequests === undefined,
      artists: artistsArr,
      members: membersArr,
      selectionsByMember,
      selectionsByArtist,
      artistsByDay,
      artistsById,
      membersById,
      sidequests: sidequestsArr,
      sidequestsByDay,
      myOverlapsByArtist,
    };
  }, [artists, members, selections, sidequests, myMemberId]);
}
