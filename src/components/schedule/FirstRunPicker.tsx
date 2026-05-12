import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Sparkles,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberChip } from "@/components/MemberChip";
import {
  SidequestDialog,
  type SidequestDraft,
  snap15,
} from "@/components/sidequests/SidequestDialog";
import { getStagePalette } from "@/lib/colors";
import {
  applyTimeToAnchor,
  clampMs,
  DAY_LABELS,
  DAYS,
  FESTIVAL_DAY_RANGE_MS,
  formatTime,
  type DayKey,
} from "@/lib/time";
import type { Artist, Member, Sidequest } from "@/lib/useScheduleData";
import { useIsOffline } from "@/lib/useIsOffline";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The day the user is currently viewing in Schedule. The picker
   *  enters at this day's arrival step every time it opens. */
  currentDay: DayKey;
  myMemberId: Id<"members"> | null;
  artistsByDay: Map<DayKey, Artist[]>;
  selectionsByMember: Map<string, Set<string>>;
  selectionsByArtist: Map<string, Array<Id<"members">>>;
  membersById: Map<string, Member>;
  sidequestsByDay: Map<DayKey, Sidequest[]>;
}

type Phase =
  | { kind: "arrival"; dayIndex: number }
  | {
      kind: "slot";
      dayIndex: number;
      slotIndex: number;
      arrivalMs: number;
    };

interface Slot {
  /** "ongoing" = artists already playing at arrival; "starts" = artists starting in a ~30 min window. */
  kind: "ongoing" | "starts";
  /** Earliest startMs in the slot — used to anchor sorting / titles. */
  startMs: number;
  /** Latest startMs in the slot. Equal to `startMs` for single-artist slots; > startMs when the window groups multiple artists. */
  endStartMs: number;
  artists: Artist[];
}

const DEFAULT_SIDEQUEST_DURATION_MS = 60 * 60 * 1000;
/**
 * Width of the bucketing window for the slot phase. All artists with
 * starts within this many ms of the bucket's anchor (its earliest
 * start) are presented in one step. Picking up to two from a single
 * step lets the user "I'll catch the back half of A and the front
 * half of B" in one decision instead of two.
 */
const SLOT_GROUP_WINDOW_MS = 30 * 60 * 1000;

function dayIndexOf(day: DayKey): number {
  const idx = DAYS.indexOf(day);
  return idx === -1 ? 0 : idx;
}

/**
 * Arrival times offered as a dropdown — 4:00pm through 8:00pm in
 * 30-minute increments. Most festival-goers arrive in this window
 * before sets start. Values are 24-hour HH:MM strings so they feed
 * directly into `applyTimeToAnchor`.
 */
const ARRIVAL_OPTIONS: Array<{ value: string; label: string }> = (() => {
  const out: Array<{ value: string; label: string }> = [];
  for (let mins = 16 * 60; mins <= 20 * 60; mins += 30) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const ampm = h >= 12 ? "pm" : "am";
    const mm = String(m).padStart(2, "0");
    const label = `${displayHour}:${mm}${ampm}`;
    out.push({ value, label });
  }
  return out;
})();

const DEFAULT_ARRIVAL_VALUE = "19:00"; // 7:00pm — typical festival start

export function FirstRunPicker({
  open,
  onClose,
  currentDay,
  myMemberId,
  artistsByDay,
  selectionsByMember,
  selectionsByArtist,
  membersById,
  sidequestsByDay,
}: Props) {
  const toggle = useMutation(api.memberSelections.toggle);
  const addManyPicks = useMutation(api.memberSelections.addMany);
  const clearPicksForDay = useMutation(api.memberSelections.clearForDay);
  const joinSidequest = useMutation(api.sidequests.join);
  const leaveSidequest = useMutation(api.sidequests.leave);
  const offline = useIsOffline();
  const [busyArtistId, setBusyArtistId] = useState<Id<"artists"> | null>(null);
  const [busySidequestId, setBusySidequestId] =
    useState<Id<"sidequests"> | null>(null);
  // While a "copy picks" request is in flight we lock the arrival
  // step so the user can't double-trigger or jump ahead before the
  // server confirms the inserts.
  const [copyBusyMemberId, setCopyBusyMemberId] =
    useState<Id<"members"> | null>(null);
  // Transient toast-style confirmation rendered at the top of the
  // arrival step after a successful copy. Auto-dismisses; bumping
  // `nonce` re-arms the auto-dismiss timer for back-to-back copies.
  const [copyToast, setCopyToast] = useState<{
    fromName: string;
    added: number;
    skipped: number;
    nonce: number;
  } | null>(null);
  // Whether the outer "Copy day from a friend" section is open. We
  // default to collapsed so the arrival step stays compact for
  // first-time users.
  const [donorsOpen, setDonorsOpen] = useState(false);
  // Set while the per-day reset request is in flight so the button
  // can show a spinner and we can short-circuit double-taps.
  const [resettingDay, setResettingDay] = useState<DayKey | null>(null);
  // Single-friend expand state for the per-donor pick preview. Only
  // one donor's pick list is shown at a time to keep scroll under
  // control on small dialogs.
  const [expandedDonorId, setExpandedDonorId] =
    useState<Id<"members"> | null>(null);
  const [phase, setPhase] = useState<Phase>(() => ({
    kind: "arrival",
    dayIndex: dayIndexOf(currentDay),
  }));
  const [arrivalDraft, setArrivalDraft] = useState<string>("");
  const [arrivalsByDay, setArrivalsByDay] = useState<Map<DayKey, number>>(
    () => new Map(),
  );
  const [sidequestDraft, setSidequestDraft] = useState<{
    open: boolean;
    defaults: SidequestDraft;
  } | null>(null);
  // Ref to the scrollable DialogContent element. We scroll the whole
  // dialog (rather than an inner ScrollArea) on every phase change so
  // the next step always starts at the top.
  const dialogScrollRef = useRef<HTMLDivElement>(null);
  // Track currentDay without retriggering the open-reset effect when
  // it changes mid-flow (which shouldn't happen since the modal
  // blocks the day tabs, but better safe than sorry).
  const currentDayRef = useRef(currentDay);
  useEffect(() => {
    currentDayRef.current = currentDay;
  }, [currentDay]);

  // On open: always enter at the arrival step for the day the user is
  // currently viewing. We don't restore stale mid-flow progress —
  // the entry point is whatever day the user just clicked from.
  useEffect(() => {
    if (!open) return;
    setPhase({ kind: "arrival", dayIndex: dayIndexOf(currentDayRef.current) });
    setArrivalsByDay(new Map());
    setCopyToast(null);
    setDonorsOpen(false);
    setExpandedDonorId(null);
  }, [open]);

  // When the user advances to a new day, collapse the per-donor
  // preview so a friend they peeked at yesterday doesn't stay open
  // for an unrelated day's list.
  useEffect(() => {
    if (phase.kind !== "arrival") return;
    setExpandedDonorId(null);
  }, [phase.kind === "arrival" ? phase.dayIndex : -1]);

  // Auto-dismiss the copy confirmation after a few seconds. `nonce`
  // is bumped on each copy so a follow-up copy resets the timer
  // instead of inheriting the previous toast's expiry.
  useEffect(() => {
    if (!copyToast) return;
    const t = setTimeout(() => setCopyToast(null), 5000);
    return () => clearTimeout(t);
  }, [copyToast?.nonce, copyToast]);

  // Seed the arrival input each time we land on the arrival phase.
  useEffect(() => {
    if (phase.kind !== "arrival") return;
    setArrivalDraft(DEFAULT_ARRIVAL_VALUE);
  }, [phase]);

  // Reset the dialog's scroll position to the top whenever we land
  // on a new step. The dialog itself owns the scroll context now,
  // so without this a long list scrolled to the bottom on step N
  // would keep its scroll position when stepping to N+1, hiding the
  // new content behind a stale viewport offset.
  useEffect(() => {
    if (!open) return;
    const el = dialogScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [open, phase]);

  /**
   * Other members who have at least one pick on a given day. Powers
   * the "Copy day's picks from someone" affordance on the arrival
   * step — sorted by pick count desc, then name asc, so the friend
   * with the most-fleshed-out plan surfaces first. Each entry also
   * carries the resolved Artist objects (sorted by start time) so
   * the per-friend expand panel can preview the picks without
   * another lookup.
   */
  const donorsByDay = useMemo<
    Map<DayKey, Array<{ member: Member; artists: Artist[] }>>
  >(() => {
    const out = new Map<
      DayKey,
      Array<{ member: Member; artists: Artist[] }>
    >();
    for (const day of DAYS) {
      const dayArtists = artistsByDay.get(day) ?? [];
      const dayArtistById = new Map<string, Artist>();
      for (const a of dayArtists) dayArtistById.set(a._id as string, a);
      const list: Array<{ member: Member; artists: Artist[] }> = [];
      for (const [memberId, picks] of selectionsByMember.entries()) {
        if (memberId === myMemberId) continue;
        const inDay: Artist[] = [];
        for (const pid of picks) {
          const artist = dayArtistById.get(pid);
          if (artist) inDay.push(artist);
        }
        if (inDay.length === 0) continue;
        const member = membersById.get(memberId);
        if (!member) continue;
        inDay.sort(
          (a, b) =>
            a.startMs - b.startMs || a.stage.localeCompare(b.stage),
        );
        list.push({ member, artists: inDay });
      }
      list.sort(
        (a, b) =>
          b.artists.length - a.artists.length ||
          a.member.name.localeCompare(b.member.name),
      );
      out.set(day, list);
    }
    return out;
  }, [artistsByDay, selectionsByMember, myMemberId, membersById]);

  const slotsByDay = useMemo<Map<DayKey, Slot[]>>(() => {
    const out = new Map<DayKey, Slot[]>();
    for (const day of DAYS) {
      const arrival = arrivalsByDay.get(day);
      if (arrival === undefined) {
        out.set(day, []);
        continue;
      }
      const list = artistsByDay.get(day) ?? [];
      const ongoing = list
        .filter((a) => a.startMs < arrival && a.endMs > arrival)
        .sort((a, b) => a.startMs - b.startMs || a.stage.localeCompare(b.stage));

      const future = list
        .filter((a) => a.startMs >= arrival)
        .sort((a, b) => a.startMs - b.startMs || a.stage.localeCompare(b.stage));

      const slots: Slot[] = [];
      if (ongoing.length > 0) {
        slots.push({
          kind: "ongoing",
          startMs: arrival,
          endStartMs: arrival,
          artists: ongoing,
        });
      }

      // Greedy bucketing: every artist whose start lands within
      // SLOT_GROUP_WINDOW_MS of the current bucket's anchor (the
      // earliest start in that bucket) joins the bucket. The next
      // out-of-window artist opens a new bucket.
      let bucket: Artist[] = [];
      let bucketAnchor = -Infinity;
      for (const a of future) {
        if (a.startMs - bucketAnchor > SLOT_GROUP_WINDOW_MS) {
          if (bucket.length > 0) {
            slots.push({
              kind: "starts",
              startMs: bucketAnchor,
              endStartMs: bucket[bucket.length - 1].startMs,
              artists: [...bucket],
            });
          }
          bucketAnchor = a.startMs;
          bucket = [a];
        } else {
          bucket.push(a);
        }
      }
      if (bucket.length > 0) {
        slots.push({
          kind: "starts",
          startMs: bucketAnchor,
          endStartMs: bucket[bucket.length - 1].startMs,
          artists: [...bucket],
        });
      }

      out.set(day, slots);
    }
    return out;
  }, [arrivalsByDay, artistsByDay]);

  if (!open) return null;

  const myPickedSet =
    (myMemberId ? selectionsByMember.get(myMemberId) : null) ??
    new Set<string>();

  /**
   * Count of the user's picks on a given festival day. Used to label
   * + gate the "Reset day's picks" button on the arrival step so the
   * user only sees it when there's actually something to clear and
   * can tell at a glance how big a wipe they're confirming.
   */
  function pickCountForDay(d: DayKey): number {
    if (myPickedSet.size === 0) return 0;
    const list = artistsByDay.get(d) ?? [];
    let n = 0;
    for (const a of list) if (myPickedSet.has(a._id)) n++;
    return n;
  }

  /**
   * Wipes the user's picks on a single day and snaps the walkthrough
   * back to that day's arrival step so any in-flight slot progress
   * doesn't refer to picks that no longer exist. Confirms first
   * because this is destructive and there's no undo.
   */
  async function handleResetCurrentDay(): Promise<void> {
    if (phase.kind !== "arrival") return;
    if (!myMemberId || offline) return;
    const day = DAYS[phase.dayIndex];
    const count = pickCountForDay(day);
    if (count === 0) return;
    if (resettingDay !== null) return;
    const dayLabel = `${DAY_LABELS[day].full} (${DAY_LABELS[day].date})`;
    const ok = window.confirm(
      `Remove your ${count} pick${count === 1 ? "" : "s"} for ${dayLabel}? Your other days stay untouched.`,
    );
    if (!ok) return;
    setResettingDay(day);
    try {
      await clearPicksForDay({ memberId: myMemberId, day });
      // Drop any cached arrival time for the day so the next
      // commitArrival recomputes slots against the now-empty pick
      // set instead of stale state.
      setArrivalsByDay((prev) => {
        if (!prev.has(day)) return prev;
        const next = new Map(prev);
        next.delete(day);
        return next;
      });
    } catch (err) {
      console.error("Failed to clear picks for day", err);
    } finally {
      setResettingDay(null);
    }
  }

  function commitArrival() {
    if (phase.kind !== "arrival") return;
    const day = DAYS[phase.dayIndex];
    const range = FESTIVAL_DAY_RANGE_MS[day];
    const candidate = applyTimeToAnchor(arrivalDraft, range.start);
    const arrivalMs = clampMs(candidate, range.start, range.end);
    setArrivalsByDay((prev) => {
      const next = new Map(prev);
      next.set(day, arrivalMs);
      return next;
    });
    setPhase({
      kind: "slot",
      dayIndex: phase.dayIndex,
      slotIndex: 0,
      arrivalMs,
    });
  }

  function advanceFromSlot() {
    if (phase.kind !== "slot") return;
    const day = DAYS[phase.dayIndex];
    const slots = slotsByDay.get(day) ?? [];
    const nextIdx = phase.slotIndex + 1;
    if (nextIdx < slots.length) {
      setPhase({ ...phase, slotIndex: nextIdx });
      return;
    }
    // Move to next day's arrival, or finish the flow.
    const nextDayIdx = phase.dayIndex + 1;
    if (nextDayIdx < DAYS.length) {
      setPhase({ kind: "arrival", dayIndex: nextDayIdx });
    } else {
      complete();
    }
  }

  function complete() {
    onClose();
  }

  function backFromSlot() {
    if (phase.kind !== "slot") return;
    if (phase.slotIndex > 0) {
      setPhase({ ...phase, slotIndex: phase.slotIndex - 1 });
      return;
    }
    // Back from first slot of a day → re-open arrival picker for that day.
    setPhase({ kind: "arrival", dayIndex: phase.dayIndex });
  }

  function backFromArrival() {
    if (phase.kind !== "arrival") return;
    if (phase.dayIndex === 0) return; // can't go further back
    const prevDayIdx = phase.dayIndex - 1;
    const prevDay = DAYS[prevDayIdx];
    const prevSlots = slotsByDay.get(prevDay) ?? [];
    if (prevSlots.length > 0) {
      setPhase({
        kind: "slot",
        dayIndex: prevDayIdx,
        slotIndex: prevSlots.length - 1,
        arrivalMs: arrivalsByDay.get(prevDay)!,
      });
    } else {
      setPhase({ kind: "arrival", dayIndex: prevDayIdx });
    }
  }

  /**
   * Copies a friend's picks for the day the arrival phase is sitting
   * on, then jumps ahead to the next day's arrival (or completes the
   * walkthrough if this was the last day). The user explicitly opted
   * into this shortcut, so we skip the slot-by-slot review — they
   * can always re-enter quick pick or tweak directly on the schedule.
   */
  async function handleCopyFromMember(
    member: Member,
    artists: Artist[],
  ) {
    if (!myMemberId || offline) return;
    if (copyBusyMemberId) return;
    if (phase.kind !== "arrival") return;
    if (artists.length === 0) return;
    setCopyBusyMemberId(member._id);
    try {
      const artistIds = artists.map((a) => a._id as Id<"artists">);
      const result = await addManyPicks({
        memberId: myMemberId,
        artistIds,
      });
      const added = result?.added ?? 0;
      const skipped = artistIds.length - added;
      setCopyToast({
        fromName: member.name,
        added,
        skipped,
        nonce: Date.now(),
      });
      const nextDayIdx = phase.dayIndex + 1;
      if (nextDayIdx < DAYS.length) {
        // Move on right away; the toast persists across the page
        // change and the user sees it on the next day's arrival step.
        setPhase({ kind: "arrival", dayIndex: nextDayIdx });
      } else {
        // Last day: hold the dialog open briefly so the user can
        // actually read the confirmation, then close.
        setTimeout(() => {
          complete();
        }, 1500);
      }
    } finally {
      setCopyBusyMemberId(null);
    }
  }

  async function handleToggle(artistId: Id<"artists">) {
    if (!myMemberId || offline) return;
    setBusyArtistId(artistId);
    try {
      await toggle({ memberId: myMemberId, artistId });
    } finally {
      setBusyArtistId(null);
    }
  }

  async function toggleSidequestJoin(sq: Sidequest) {
    if (!myMemberId || offline) return;
    const iJoined = sq.participantMemberIds.some((id) => id === myMemberId);
    // Creators are auto-joined and the server rejects them leaving —
    // bail rather than firing a request that's guaranteed to fail.
    if (iJoined && sq.createdByMemberId === myMemberId) return;
    setBusySidequestId(sq._id);
    try {
      if (iJoined) {
        await leaveSidequest({ sidequestId: sq._id, memberId: myMemberId });
      } else {
        await joinSidequest({ sidequestId: sq._id, memberId: myMemberId });
      }
    } finally {
      setBusySidequestId(null);
    }
  }

  function openSidequestDialog(slot: Slot, day: DayKey) {
    const range = FESTIVAL_DAY_RANGE_MS[day];
    const startMs = clampMs(snap15(slot.startMs), range.start, range.end - 60_000);
    const endMs = clampMs(
      snap15(startMs + DEFAULT_SIDEQUEST_DURATION_MS),
      startMs + 60_000,
      range.end,
    );
    setSidequestDraft({
      open: true,
      defaults: {
        day,
        startMs,
        endMs,
        title: "",
        location: "",
        notes: "",
      },
    });
  }

  // ---------- Render ----------

  if (phase.kind === "arrival") {
    const day = DAYS[phase.dayIndex];
    const dayLabel = DAY_LABELS[day];
    const totalDays = DAYS.length;
    const donors = donorsByDay.get(day) ?? [];
    const isCopying = copyBusyMemberId !== null;
    const dayPickCount = pickCountForDay(day);
    const isResettingThisDay = resettingDay === day;
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          ref={dialogScrollRef}
          className="max-h-[90dvh] max-w-md gap-0 overflow-y-auto p-0"
        >
          <DialogHeader className="space-y-2 border-b border-border/40 px-5 pb-3 pt-5">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="size-3" />
                Quick pick
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                Day {phase.dayIndex + 1} / {totalDays}
              </span>
            </div>
            <DialogTitle className="text-lg leading-tight">
              When will you arrive on {dayLabel.full}?
            </DialogTitle>
            <DialogDescription>
              We&apos;ll start your picks from this time, including any sets
              that&apos;ll already be in progress when you get there.
            </DialogDescription>
          </DialogHeader>

          {copyToast && (
            <div
              role="status"
              aria-live="polite"
              className="mx-5 mt-3 flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100"
            >
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {copyToast.added > 0
                    ? `Copied ${copyToast.added} pick${
                        copyToast.added === 1 ? "" : "s"
                      } from ${copyToast.fromName}`
                    : `${copyToast.fromName}'s picks were already on your schedule`}
                </div>
                {copyToast.skipped > 0 && copyToast.added > 0 && (
                  <div className="text-[11px] text-emerald-200/80">
                    {copyToast.skipped} already on your schedule, skipped.
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCopyToast(null)}
                className="-mr-1 -mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded text-emerald-200/70 transition-colors hover:bg-emerald-500/15 hover:text-emerald-100"
                aria-label="Dismiss"
              >
                <X className="size-3" />
              </button>
            </div>
          )}

          <div className="space-y-2 px-5 py-4">
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Clock className="size-3" />
              Arrival time
            </span>
            <Select value={arrivalDraft} onValueChange={setArrivalDraft}>
              <SelectTrigger className="h-10 w-44 tabular-nums">
                <SelectValue placeholder="Pick a time" />
              </SelectTrigger>
              <SelectContent>
                {ARRIVAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {donors.length > 0 && (
            <div className="border-t border-border/40 px-5 py-3">
              <button
                type="button"
                onClick={() => setDonorsOpen((o) => !o)}
                aria-expanded={donorsOpen ? "true" : "false"}
                className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-secondary/40"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Copy className="size-3" />
                  Copy {dayLabel.short} from a friend
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-muted-foreground">
                    {donors.length}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform",
                    donorsOpen && "rotate-180",
                  )}
                />
              </button>
              {donorsOpen && (
                <ul className="mt-2 space-y-1.5">
                  {donors.map(({ member, artists }) => {
                    const isThis = copyBusyMemberId === member._id;
                    const isExpanded = expandedDonorId === member._id;
                    return (
                      <li
                        key={member._id}
                        className="overflow-hidden rounded-lg border border-border/60 bg-card/40"
                      >
                        <div className="flex items-center gap-1 px-1 py-1">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDonorId((cur) =>
                                cur === member._id ? null : member._id,
                              )
                            }
                            aria-expanded={isExpanded ? "true" : "false"}
                            aria-label={`Show ${member.name}'s picks`}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary/50"
                          >
                            <ChevronDown
                              className={cn(
                                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                                isExpanded && "rotate-180",
                              )}
                            />
                            <span
                              aria-hidden
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: member.color }}
                            />
                            <span className="truncate text-sm font-medium">
                              {member.name}
                            </span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              · {artists.length} pick
                              {artists.length === 1 ? "" : "s"}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={!myMemberId || offline || isCopying}
                            onClick={() =>
                              void handleCopyFromMember(member, artists)
                            }
                            title={
                              offline
                                ? "Offline — reconnect to copy"
                                : `Copy ${member.name}'s picks for ${dayLabel.short}`
                            }
                            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isThis ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                            Copy
                          </button>
                        </div>
                        {isExpanded && (
                          <ul className="max-h-56 space-y-1 overflow-y-auto border-t border-border/40 bg-background/30 px-2 py-2">
                            {artists.map((a) => {
                              const palette = getStagePalette(a.stage);
                              const youHave = myPickedSet.has(a._id);
                              return (
                                <li
                                  key={a._id}
                                  className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[11px]"
                                >
                                  <span
                                    aria-hidden
                                    className="size-1.5 shrink-0 rounded-full"
                                    style={{
                                      backgroundColor: `rgb(${palette.rgb})`,
                                    }}
                                  />
                                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                                    {formatTime(a.startMs)}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                                    {a.name}
                                  </span>
                                  <span
                                    className="shrink-0 truncate text-[10px]"
                                    style={{ color: `rgb(${palette.rgb})` }}
                                  >
                                    {a.stage}
                                  </span>
                                  {youHave && (
                                    <span
                                      title="You already picked this"
                                      className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary"
                                    >
                                      <Check className="size-2.5" />
                                      Yours
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="space-y-2 border-t border-border/40 bg-background/40 px-4 py-3">
            <Button
              onClick={commitArrival}
              disabled={!arrivalDraft || isCopying}
              className="w-full"
              size="lg"
            >
              Continue <ChevronRight className="size-4" />
            </Button>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={backFromArrival}
                disabled={phase.dayIndex === 0}
              >
                Back
              </Button>
              {dayPickCount > 0 && myMemberId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleResetCurrentDay()}
                  disabled={offline || isResettingThisDay || isCopying}
                  title={
                    offline
                      ? "Offline — reconnect to reset"
                      : `Remove your ${dayPickCount} pick${
                          dayPickCount === 1 ? "" : "s"
                        } on ${dayLabel.full}`
                  }
                >
                  {isResettingThisDay ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  Reset {dayLabel.short} ({dayPickCount})
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="size-3.5" />
                Exit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // phase.kind === "slot"
  const day = DAYS[phase.dayIndex];
  const dayLabel = DAY_LABELS[day];
  const slots = slotsByDay.get(day) ?? [];
  const currentSlot = slots[phase.slotIndex] ?? slots[slots.length - 1];
  if (!currentSlot) {
    // No slots for this day (e.g. a stale resume on a day with no
    // future artists). Send the user back to that day's arrival
    // picker rather than closing entirely.
    if (phase.slotIndex !== 0 || arrivalsByDay.get(day) === undefined) {
      setPhase({ kind: "arrival", dayIndex: phase.dayIndex });
    }
    return null;
  }

  const totalSteps = slots.length;
  const effectiveSlotIndex = Math.min(phase.slotIndex, totalSteps - 1);
  const isLastDayLastSlot =
    phase.dayIndex === DAYS.length - 1 &&
    effectiveSlotIndex === totalSteps - 1;
  const slotIsRange =
    currentSlot.kind === "starts" && currentSlot.endStartMs > currentSlot.startMs;

  const sidequestsAtSlot = (sidequestsByDay.get(day) ?? []).filter(
    (sq) => sq.startMs <= currentSlot.startMs && sq.endMs > currentSlot.startMs,
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          ref={dialogScrollRef}
          className="max-h-[90dvh] max-w-lg gap-0 overflow-y-auto p-0"
        >
          <DialogHeader className="space-y-2 border-b border-border/40 px-5 pb-3 pt-5">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="size-3" />
                Quick pick
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {dayLabel.short} · {effectiveSlotIndex + 1} / {totalSteps}
              </span>
            </div>
            <DialogTitle className="text-lg leading-tight">
              {currentSlot.kind === "ongoing"
                ? `Still playing when you arrive at ${formatTime(phase.arrivalMs)}`
                : slotIsRange
                  ? `${dayLabel.full} · ${formatTime(currentSlot.startMs)} – ${formatTime(currentSlot.endStartMs)}`
                  : `${dayLabel.full} · ${formatTime(currentSlot.startMs)}`}
            </DialogTitle>
            <DialogDescription>
              {currentSlot.kind === "ongoing"
                ? "Catch the tail end of any of these — or skip ahead and pick from what starts next."
                : slotIsRange
                  ? "These sets all start within ~30 minutes of each other. Pick anyone you'd catch — pick two if you want to do half-and-half."
                  : "Pick anyone you want to see at this time. You can pick more than one if you want to catch half of two sets."}
            </DialogDescription>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${((effectiveSlotIndex + 1) / totalSteps) * 100}%`,
                }}
              />
            </div>
          </DialogHeader>

          <div className="px-5">
            <div className="space-y-2 py-3">
              {sidequestsAtSlot.length > 0 && (
                <div className="space-y-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-2.5">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-violet-300">
                    Sidequests at this time
                  </div>
                  <ul className="space-y-1.5">
                    {sidequestsAtSlot.map((sq) => {
                      const iJoined =
                        !!myMemberId &&
                        sq.participantMemberIds.some((id) => id === myMemberId);
                      const isCreator =
                        !!myMemberId && sq.createdByMemberId === myMemberId;
                      const isBusy = busySidequestId === sq._id;
                      return (
                        <li
                          key={sq._id}
                          className="flex items-start gap-2 rounded-md border border-violet-500/20 bg-violet-500/10 p-2"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="truncate text-xs font-semibold text-violet-100">
                              {sq.title}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                              <span className="tabular-nums">
                                {formatTime(sq.startMs)}–{formatTime(sq.endMs)}
                              </span>
                              {sq.location && (
                                <span className="inline-flex items-center gap-0.5 truncate">
                                  <MapPin className="size-2.5 shrink-0" />
                                  <span className="truncate">{sq.location}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={
                              !myMemberId ||
                              offline ||
                              isBusy ||
                              (iJoined && isCreator)
                            }
                            onClick={() => void toggleSidequestJoin(sq)}
                            title={
                              isCreator
                                ? "You're the creator"
                                : iJoined
                                  ? "Leave this sidequest"
                                  : "Join this sidequest"
                            }
                            className={cn(
                              "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                              iJoined
                                ? "bg-violet-500/30 text-violet-100 ring-1 ring-violet-500/60 hover:bg-violet-500/40"
                                : "border border-dashed border-violet-500/50 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20",
                            )}
                          >
                            {isBusy ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : iJoined ? (
                              isCreator ? (
                                <Check className="size-3" />
                              ) : (
                                <UserX className="size-3" />
                              )
                            ) : (
                              <UserPlus className="size-3" />
                            )}
                            {iJoined
                              ? isCreator
                                ? "Hosting"
                                : "Joined"
                              : "Join"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {currentSlot.artists.map((a) => {
                const palette = getStagePalette(a.stage);
                const pickedIds = selectionsByArtist.get(a._id) ?? [];
                const youPicked = !!myMemberId && myPickedSet.has(a._id);
                const isBusy = busyArtistId === a._id;
                const otherPickers = pickedIds
                  .filter((id) => id !== myMemberId)
                  .map((id) => membersById.get(id))
                  .filter((m): m is Member => Boolean(m));

                return (
                  <button
                    key={a._id}
                    type="button"
                    disabled={!myMemberId || offline || isBusy}
                    onClick={() => handleToggle(a._id)}
                    className={cn(
                      "flex w-full flex-col items-stretch gap-1.5 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      youPicked
                        ? "border-primary/60 bg-primary/10 ring-1 ring-primary/40"
                        : "border-border/60 bg-card/40 hover:bg-card/60",
                    )}
                    style={
                      youPicked
                        ? undefined
                        : {
                            backgroundColor: `rgb(${palette.rgb} / 0.06)`,
                            borderColor: `rgb(${palette.rgb} / 0.35)`,
                          }
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
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
                            {a.stage}
                          </span>
                          {currentSlot.kind === "ongoing" &&
                            a.startMs < phase.arrivalMs && (
                              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-500/40">
                                Already started
                              </span>
                            )}
                        </div>
                        <div className="mt-1 truncate text-sm font-semibold">
                          {a.name}
                        </div>
                        <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                          {formatTime(a.startMs)} – {formatTime(a.endMs)}
                          {currentSlot.kind === "ongoing" && (
                            <>
                              {" "}
                              · {Math.max(
                                0,
                                Math.round(
                                  (a.endMs - phase.arrivalMs) / 60000,
                                ),
                              )}{" "}
                              min left
                            </>
                          )}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium",
                          youPicked
                            ? "bg-primary text-primary-foreground"
                            : "border border-dashed border-foreground/40 text-muted-foreground",
                        )}
                      >
                        {isBusy ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : youPicked ? (
                          <Check className="size-3" />
                        ) : (
                          <Plus className="size-3" />
                        )}
                        {youPicked ? "Picked" : "Pick"}
                      </div>
                    </div>
                    {otherPickers.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Going:
                        </span>
                        {otherPickers.map((m) => (
                          <MemberChip
                            key={m._id}
                            name={m.name}
                            color={m.color}
                            size="xs"
                            truncate
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}

              <button
                type="button"
                disabled={!myMemberId || offline}
                onClick={() => openSidequestDialog(currentSlot, day)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-violet-500/40 bg-violet-500/5 px-3 py-3 text-sm font-medium text-violet-200 transition-colors hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  offline
                    ? "Offline — reconnect to add a sidequest"
                    : "Plan a non-set activity (food, ride, art car, etc.)"
                }
              >
                <Plus className="size-4" />
                Add a sidequest at {formatTime(currentSlot.startMs)}
                <MapPin className="size-3.5 opacity-70" />
              </button>
            </div>
          </div>

          <div className="space-y-2 border-t border-border/40 bg-background/40 px-4 py-3">
            <Button
              onClick={advanceFromSlot}
              disabled={offline}
              className="w-full"
              size="lg"
            >
              {isLastDayLastSlot ? "Done" : "Continue to next"}
              {!isLastDayLastSlot && <ChevronRight className="size-4" />}
            </Button>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <Button variant="ghost" size="sm" onClick={backFromSlot}>
                Back
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="size-3.5" />
                Exit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {sidequestDraft && (
        <SidequestDialog
          open={sidequestDraft.open}
          onOpenChange={(open) =>
            setSidequestDraft((prev) =>
              prev ? { ...prev, open } : prev,
            )
          }
          mode={{ kind: "create", defaults: sidequestDraft.defaults }}
          myMemberId={myMemberId}
        />
      )}
    </>
  );
}
