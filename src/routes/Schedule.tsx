import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  CalendarClock,
  LayoutGrid,
  Loader2,
  Map as MapIcon,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useIsOffline } from "@/lib/useIsOffline";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DesktopGrid } from "@/components/schedule/DesktopGrid";
import { MobileStageList } from "@/components/schedule/MobileStageList";
import { MyDayTimeline } from "@/components/schedule/MyDayTimeline";
import { FirstRunPicker } from "@/components/schedule/FirstRunPicker";
import { SidequestList } from "@/components/sidequests/SidequestList";
import {
  SidequestDialog,
  snap15,
  type SidequestDraft,
} from "@/components/sidequests/SidequestDialog";
import {
  OnboardingTour,
  isTourInProgress,
  markTourSeen,
} from "@/components/onboarding/OnboardingTour";
import { MapDayDialog } from "@/components/map/MapDayDialog";
import { useScheduleData } from "@/lib/useScheduleData";
import { useMemberSession } from "@/lib/useMemberSession";
import {
  DAY_LABELS,
  DAYS,
  FESTIVAL_DAY_RANGE_MS,
  clampMs,
  getCurrentFestivalDay,
  type DayKey,
} from "@/lib/time";
import type { Id } from "../../convex/_generated/dataModel";
import type { Sidequest } from "@/lib/useScheduleData";
import { cn } from "@/lib/utils";

type MobileTab = "artists" | "sidequests";
type ScheduleView = "schedule" | "myday";

interface EditState {
  open: boolean;
  mode:
    | { kind: "create"; defaults: SidequestDraft }
    | { kind: "edit"; sidequestId: Id<"sidequests">; defaults: SidequestDraft };
}

const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const FIRST_RUN_STORAGE_PREFIX = "edc.first-run-picker.shown.v1";
const VIEW_STORAGE_KEY = "edc.schedule-view.v1";
/**
 * Per-festival-day flag tracking whether we already auto-opened
 * "My Day" for that calendar date. Stored as
 * `edc.auto-myday.<day_key>` so each of the three days gets its own
 * one-time autoswitch — and any manual change the user makes after
 * that sticks for the rest of the day.
 */
const AUTO_MYDAY_PREFIX = "edc.auto-myday.v1";

function firstRunStorageKey(memberId: string): string {
  return `${FIRST_RUN_STORAGE_PREFIX}:${memberId}`;
}

function loadInitialView(): ScheduleView {
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === "myday" || v === "schedule") return v;
  } catch {
    /* no-op */
  }
  return "schedule";
}

/**
 * Decide the day + view to land on when Schedule first mounts.
 *
 * On a festival day we want the user to drop straight into their
 * "My Day" timeline for that day — but only on the first visit per
 * device per festival day. After the auto-switch has fired once (or
 * after the user manually changes view), we respect whatever they
 * picked and let the saved preference drive subsequent renders.
 */
function loadInitialDayAndView(): { day: DayKey; view: ScheduleView } {
  const today = getCurrentFestivalDay();
  if (today) {
    const flagKey = `${AUTO_MYDAY_PREFIX}:${today}`;
    let alreadyAuto = false;
    try {
      alreadyAuto = window.localStorage.getItem(flagKey) === "1";
    } catch {
      /* no-op */
    }
    if (!alreadyAuto) {
      try {
        window.localStorage.setItem(flagKey, "1");
      } catch {
        /* no-op */
      }
      return { day: today, view: "myday" };
    }
    // Auto-switch already fired today: still default the day
    // selector to today, but honor the saved view preference.
    return { day: today, view: loadInitialView() };
  }
  return { day: "day_1", view: loadInitialView() };
}

export default function Schedule() {
  const session = useMemberSession();
  const data = useScheduleData();
  const initial = useMemo(() => loadInitialDayAndView(), []);
  const [day, setDay] = useState<DayKey>(initial.day);
  const [search, setSearch] = useState("");
  const [mobileTab, setMobileTab] = useState<MobileTab>("artists");
  const [view, setView] = useState<ScheduleView>(initial.view);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [firstRunOpen, setFirstRunOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourResumable, setTourResumable] = useState<boolean>(() =>
    isTourInProgress(),
  );
  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const clearPicksForDay = useMutation(api.memberSelections.clearForDay);
  const offline = useIsOffline();
  const [resettingDay, setResettingDay] = useState<DayKey | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* no-op */
    }
  }, [view]);

  // The tour stores its progress in localStorage. Whenever the dialog
  // opens or closes we re-check the resume flag so the banner reflects
  // the current state — including the dismissed and completed cases.
  useEffect(() => {
    setTourResumable(isTourInProgress());
  }, [tourOpen]);

  const myMemberId = session.status === "authed" ? session.memberId : null;

  // Show the first-run picker once for each new member who lands on
  // Schedule with an empty pick list. The dismiss flag is keyed by
  // memberId so multiple accounts on the same browser each get their
  // own walkthrough. (Skipping or completing the picker both set
  // the flag.)
  useEffect(() => {
    if (data.loading) return;
    if (!myMemberId) return;
    let alreadyShown = false;
    try {
      alreadyShown =
        window.localStorage.getItem(firstRunStorageKey(myMemberId)) === "1";
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
    if (!myMemberId) return;
    try {
      window.localStorage.setItem(firstRunStorageKey(myMemberId), "1");
    } catch {
      /* no-op */
    }
  }

  function reopenWalkthrough() {
    if (!myMemberId) return;
    try {
      window.localStorage.removeItem(firstRunStorageKey(myMemberId));
    } catch {
      /* no-op */
    }
    setFirstRunOpen(true);
  }

  // Count of the signed-in member's picks on the currently visible
  // day. Powers the "Reset day's picks" button copy and gates whether
  // it shows up at all (no point offering a reset on a day with no
  // picks).
  const myDayPickCount = useMemo(() => {
    if (!myMemberId) return 0;
    const myPicks = data.selectionsByMember.get(myMemberId);
    if (!myPicks || myPicks.size === 0) return 0;
    const dayList = data.artistsByDay.get(day) ?? [];
    let n = 0;
    for (const a of dayList) if (myPicks.has(a._id)) n++;
    return n;
  }, [myMemberId, data.selectionsByMember, data.artistsByDay, day]);

  async function handleResetDayPicks() {
    if (!myMemberId || offline) return;
    if (myDayPickCount === 0) return;
    if (resettingDay !== null) return;
    const dayLabel = `${DAY_LABELS[day].full} (${DAY_LABELS[day].date})`;
    const ok = window.confirm(
      `Remove your ${myDayPickCount} pick${
        myDayPickCount === 1 ? "" : "s"
      } for ${dayLabel}? Your other days stay untouched.`,
    );
    if (!ok) return;
    setResettingDay(day);
    try {
      await clearPicksForDay({ memberId: myMemberId, day });
    } catch (err) {
      console.error("Failed to clear picks for day", err);
    } finally {
      setResettingDay(null);
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
        <ViewSwitcher view={view} onChange={setView} />

        <Tabs
          value={day}
          onValueChange={(v) => setDay(v as DayKey)}
          className="w-full"
        >
          <TabsList className="grid h-10 w-full grid-cols-3">
            {DAYS.map((d) => (
              <TabsTrigger
                key={d}
                value={d}
                className="w-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=active]:shadow-primary/20"
              >
                <span className="hidden sm:inline">{DAY_LABELS[d].full}</span>
                <span className="sm:hidden">
                  {DAY_LABELS[d].short} {DAY_LABELS[d].date}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setMapDialogOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-card/60"
            title={`See pinned spots for ${DAY_LABELS[day].full}`}
          >
            <MapIcon className="size-3" />
            View map
          </button>
          {myMemberId && myDayPickCount > 0 && (
            <button
              type="button"
              onClick={() => void handleResetDayPicks()}
              disabled={offline || resettingDay !== null}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border/60 bg-card/40 px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              title={
                offline
                  ? "Offline — reconnect to reset"
                  : `Remove your ${myDayPickCount} pick${
                      myDayPickCount === 1 ? "" : "s"
                    } on ${DAY_LABELS[day].full}`
              }
            >
              {resettingDay === day ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RotateCcw className="size-3" />
              )}
              Reset {DAY_LABELS[day].weekday} Picks
              <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold text-foreground">
                {myDayPickCount}
              </span>
            </button>
          )}
        </div>

        {myMemberId && (
          <button
            type="button"
            onClick={reopenWalkthrough}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20 ring-1 ring-primary/40 transition-all hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Open the artist quick-pick walkthrough"
          >
            <Sparkles className="size-4" />
            Quick-pick walkthrough
          </button>
        )}

        {tourResumable && (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 text-xs sm:text-sm">
              <span className="font-medium">Finish your tour</span>
              <span className="ml-1.5 text-muted-foreground">
                Pick up where you left off.
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  markTourSeen();
                  setTourResumable(false);
                }}
                aria-label="Dismiss onboarding tour"
              >
                <X className="size-3.5" />
              </Button>
              <Button size="sm" onClick={() => setTourOpen(true)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {view === "schedule" && (
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
        )}

        {view === "schedule" && mobileTab === "artists" && (
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

        {view === "schedule" && mobileTab === "artists" && search && (
          <p className="text-[11px] text-muted-foreground">
            {dayArtists.length === 0
              ? `No matches for "${search}" on ${DAY_LABELS[day].short} ${DAY_LABELS[day].date}.`
              : `${dayArtists.length} match${dayArtists.length === 1 ? "" : "es"} on ${DAY_LABELS[day].short} ${DAY_LABELS[day].date} for "${search}".`}
          </p>
        )}

        {view === "schedule" && (
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
        )}

        {view === "myday" && (
          <MyDayTimeline
            day={day}
            data={data}
            myMemberId={myMemberId}
            onCreateSidequest={openCreateSidequest}
            onEditSidequest={openEditSidequest}
            onOpenWalkthrough={reopenWalkthrough}
          />
        )}
      </div>

      {/* Desktop calendar breaks out of max-w to use the full viewport. */}
      {view === "schedule" && (
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
      )}

      {view === "schedule" && mobileTab === "sidequests" && myMemberId && (
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
        currentDay={day}
        myMemberId={myMemberId}
        artistsByDay={data.artistsByDay}
        selectionsByMember={data.selectionsByMember}
        selectionsByArtist={data.selectionsByArtist}
        membersById={data.membersById}
        sidequestsByDay={data.sidequestsByDay}
      />

      <OnboardingTour
        open={tourOpen}
        onClose={() => setTourOpen(false)}
      />

      <MapDayDialog
        open={mapDialogOpen}
        onOpenChange={setMapDialogOpen}
        day={day}
      />
    </div>
  );
}

function ViewSwitcher({
  view,
  onChange,
}: {
  view: ScheduleView;
  onChange: (next: ScheduleView) => void;
}) {
  const options: Array<{
    value: ScheduleView;
    label: string;
    icon: typeof LayoutGrid;
    hint: string;
  }> = [
    {
      value: "schedule",
      label: "Schedule",
      icon: LayoutGrid,
      hint: "All stages & sidequests",
    },
    {
      value: "myday",
      label: "My Day",
      icon: CalendarClock,
      hint: "Your picks, meetups & sidequests",
    },
  ];
  return (
    <div
      role="tablist"
      aria-label="Schedule view"
      className="grid w-full grid-cols-2 gap-1.5 rounded-xl border border-border/60 bg-gradient-to-b from-card/80 to-card/30 p-1.5 shadow-sm"
    >
      {options.map(({ value, label, icon: Icon, hint }) => {
        const active = value === view;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(value)}
            className={cn(
              "group relative flex flex-col items-start gap-1 rounded-lg px-3 py-2.5 text-left transition-all sm:py-3",
              active
                ? "bg-primary/15 text-foreground ring-1 ring-primary/40 shadow-[inset_0_1px_0_0_rgb(255_255_255/4%)]"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-2">
              <Icon
                className={cn(
                  "size-4 transition-colors sm:size-5",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span className="text-sm font-semibold leading-tight sm:text-base">
                {label}
              </span>
            </span>
            <span className="block text-[11px] leading-snug text-muted-foreground sm:text-xs">
              {hint}
            </span>
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-primary/70"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
