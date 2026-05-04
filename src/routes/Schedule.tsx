import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { DesktopGrid } from "@/components/schedule/DesktopGrid";
import { MobileStageList } from "@/components/schedule/MobileStageList";
import { CopyFromPersonDialog } from "@/components/schedule/CopyFromPersonDialog";
import { FirstRunPicker } from "@/components/schedule/FirstRunPicker";
import { SidequestList } from "@/components/sidequests/SidequestList";
import {
  SidequestDialog,
  snap15,
  type SidequestDraft,
} from "@/components/sidequests/SidequestDialog";
import { useScheduleData } from "@/lib/useScheduleData";
import { useMemberSession } from "@/lib/useMemberSession";
import {
  DAY_LABELS,
  DAYS,
  FESTIVAL_DAY_RANGE_MS,
  clampMs,
  type DayKey,
} from "@/lib/time";
import type { Id } from "../../convex/_generated/dataModel";
import type { Sidequest } from "@/lib/useScheduleData";
import { cn } from "@/lib/utils";

type MobileTab = "artists" | "sidequests";

interface EditState {
  open: boolean;
  mode:
    | { kind: "create"; defaults: SidequestDraft }
    | { kind: "edit"; sidequestId: Id<"sidequests">; defaults: SidequestDraft };
}

const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const FIRST_RUN_STORAGE_KEY = "edc.first-run-picker.shown.v1";

export default function Schedule() {
  const session = useMemberSession();
  const data = useScheduleData();
  const [day, setDay] = useState<DayKey>("day_1");
  const [search, setSearch] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("artists");
  const [editState, setEditState] = useState<EditState | null>(null);
  const [firstRunOpen, setFirstRunOpen] = useState(false);

  const myMemberId = session.status === "authed" ? session.memberId : null;

  // Show the first-run picker once for new users who land on Schedule
  // with an empty pick list. Persisted in localStorage so it never
  // re-opens on its own. (Skipping or completing the picker both set
  // the flag.)
  useEffect(() => {
    if (data.loading) return;
    if (!myMemberId) return;
    let alreadyShown = false;
    try {
      alreadyShown =
        window.localStorage.getItem(FIRST_RUN_STORAGE_KEY) === "1";
    } catch {
      /* no-op */
    }
    if (alreadyShown) return;
    const myPicks = data.selectionsByMember.get(myMemberId);
    if (myPicks && myPicks.size > 0) return;
    setFirstRunOpen(true);
  }, [data.loading, myMemberId, data.selectionsByMember]);

  function dismissFirstRun() {
    setFirstRunOpen(false);
    try {
      window.localStorage.setItem(FIRST_RUN_STORAGE_KEY, "1");
    } catch {
      /* no-op */
    }
  }

  const matchedArtistIds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return null;
    const set = new Set<string>();
    for (const a of data.artists) {
      if (a.name.toLowerCase().includes(term)) set.add(a._id);
    }
    return set;
  }, [search, data.artists]);

  const dayArtists = useMemo(() => {
    const all = data.artistsByDay.get(day) ?? [];
    if (!matchedArtistIds) return all;
    return all.filter((a) => matchedArtistIds.has(a._id));
  }, [data.artistsByDay, day, matchedArtistIds]);

  const daySidequests = useMemo(
    () => data.sidequestsByDay.get(day) ?? [],
    [data.sidequestsByDay, day],
  );

  const pickCountForDay = useMemo(() => {
    return (memberId: Id<"members">) => {
      const memberPicks = data.selectionsByMember.get(memberId);
      if (!memberPicks || memberPicks.size === 0) return 0;
      const dayList = data.artistsByDay.get(day) ?? [];
      let count = 0;
      for (const a of dayList) {
        if (memberPicks.has(a._id)) count++;
      }
      return count;
    };
  }, [data.selectionsByMember, data.artistsByDay, day]);

  const sidequestCountForDay = useMemo(() => {
    return (memberId: Id<"members">) => {
      const list = data.sidequestsByDay.get(day) ?? [];
      let count = 0;
      for (const sq of list) {
        if (sq.participantMemberIds.some((id) => id === memberId)) count++;
      }
      return count;
    };
  }, [data.sidequestsByDay, day]);

  function openCreateSidequest() {
    const range = FESTIVAL_DAY_RANGE_MS[day];
    // Default to a 1-hour block centered on the start of the day's
    // prime hours (7pm PDT). The user can fine-tune in the dialog.
    const sevenPmPdt = range.start + 2 * 60 * 60 * 1000;
    const startMs = clampMs(snap15(sevenPmPdt), range.start, range.end - 60_000);
    const endMs = clampMs(
      snap15(startMs + DEFAULT_DURATION_MS),
      startMs + 60_000,
      range.end,
    );
    setEditState({
      open: true,
      mode: {
        kind: "create",
        defaults: {
          day,
          startMs,
          endMs,
          title: "",
          location: "",
          notes: "",
        },
      },
    });
  }

  function openEditSidequest(sq: Sidequest) {
    setEditState({
      open: true,
      mode: {
        kind: "edit",
        sidequestId: sq._id,
        defaults: {
          day: sq.day,
          startMs: sq.startMs,
          endMs: sq.endMs,
          title: sq.title,
          location: sq.location ?? "",
          notes: sq.notes ?? "",
        },
      },
    });
  }

  if (data.loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="mx-auto w-full max-w-7xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={day} onValueChange={(v) => setDay(v as DayKey)}>
            <TabsList>
              {DAYS.map((d) => (
                <TabsTrigger key={d} value={d}>
                  <span className="hidden sm:inline">{DAY_LABELS[d].full}</span>
                  <span className="sm:hidden">
                    {DAY_LABELS[d].short} {DAY_LABELS[d].date}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <CopyFromPersonDialog
            members={data.members}
            myMemberId={myMemberId}
            day={day}
            pickCountForDay={pickCountForDay}
            sidequestCountForDay={sidequestCountForDay}
          />
        </div>

        <div className="md:hidden">
          <div className="flex items-center gap-1 rounded-md border border-border/60 bg-card/40 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setMobileTab("artists")}
              className={cn(
                "flex-1 rounded px-3 py-1.5 transition-colors",
                mobileTab === "artists"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Artists
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("sidequests")}
              className={cn(
                "flex-1 rounded px-3 py-1.5 transition-colors",
                mobileTab === "sidequests"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                Sidequests
                {daySidequests.length > 0 && (
                  <span className="rounded-full bg-violet-500/20 px-1.5 text-[10px] font-semibold text-violet-200">
                    {daySidequests.length}
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>

        {mobileTab === "artists" && (
          <div className="relative md:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search artists…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )}

        {mobileTab === "artists" && search && (
          <p className="text-[11px] text-muted-foreground">
            {dayArtists.length === 0
              ? `No matches for "${search}" on ${DAY_LABELS[day].short} ${DAY_LABELS[day].date}.`
              : `${dayArtists.length} match${dayArtists.length === 1 ? "" : "es"} on ${DAY_LABELS[day].short} ${DAY_LABELS[day].date} for "${search}".`}
          </p>
        )}

        <div className="md:hidden">
          {mobileTab === "artists" ? (
            <MobileStageList
              artists={dayArtists}
              selectionsByArtist={data.selectionsByArtist}
              membersById={data.membersById}
              myMemberId={myMemberId}
              myOverlapsByArtist={data.myOverlapsByArtist}
              flatten={!!search.trim()}
            />
          ) : (
            <SidequestList
              sidequests={daySidequests}
              membersById={data.membersById}
              myMemberId={myMemberId}
              onCreate={openCreateSidequest}
              onEdit={openEditSidequest}
            />
          )}
        </div>
      </div>

      {/* Desktop calendar breaks out of max-w to use the full viewport. */}
      <div className="hidden md:block">
        <DesktopGrid
          day={day}
          artists={dayArtists}
          selectionsByArtist={data.selectionsByArtist}
          membersById={data.membersById}
          myMemberId={myMemberId}
          myOverlapsByArtist={data.myOverlapsByArtist}
          sidequests={daySidequests}
        />
      </div>

      {mobileTab === "sidequests" && myMemberId && (
        <button
          type="button"
          onClick={openCreateSidequest}
          aria-label="Create a sidequest"
          className="md:hidden fixed right-4 z-30 inline-flex size-12 items-center justify-center rounded-full bg-violet-500 text-white shadow-lg shadow-violet-500/30 transition-transform active:scale-95"
          style={{
            bottom: "calc(env(safe-area-inset-bottom) + 5rem)",
          }}
        >
          <Plus className="size-5" />
        </button>
      )}

      {editState && (
        <SidequestDialog
          open={editState.open}
          onOpenChange={(open) =>
            setEditState((prev) => (prev ? { ...prev, open } : prev))
          }
          mode={editState.mode}
          myMemberId={myMemberId}
        />
      )}

      <FirstRunPicker
        open={firstRunOpen}
        onClose={dismissFirstRun}
        myMemberId={myMemberId}
        artistsByDay={data.artistsByDay}
        selectionsByMember={data.selectionsByMember}
        selectionsByArtist={data.selectionsByArtist}
        membersById={data.membersById}
        sidequestsByDay={data.sidequestsByDay}
      />
    </div>
  );
}
