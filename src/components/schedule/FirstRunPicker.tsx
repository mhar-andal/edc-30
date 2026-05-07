import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  Check,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Sparkles,
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
import { ScrollArea } from "@/components/ui/scroll-area";
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
const PROGRESS_STORAGE_PREFIX = "edc.first-run-picker.progress.v1";

interface SavedProgress {
  arrivalsByDay: Record<string, number>;
  phase: Phase;
}

function progressKey(memberId: string): string {
  return `${PROGRESS_STORAGE_PREFIX}:${memberId}`;
}

function loadProgress(memberId: string): SavedProgress | null {
  try {
    const raw = window.localStorage.getItem(progressKey(memberId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedProgress;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistProgress(memberId: string, progress: SavedProgress) {
  try {
    window.localStorage.setItem(progressKey(memberId), JSON.stringify(progress));
  } catch {
    /* no-op */
  }
}

function clearProgress(memberId: string) {
  try {
    window.localStorage.removeItem(progressKey(memberId));
  } catch {
    /* no-op */
  }
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
  myMemberId,
  artistsByDay,
  selectionsByMember,
  selectionsByArtist,
  membersById,
  sidequestsByDay,
}: Props) {
  const toggle = useMutation(api.memberSelections.toggle);
  const offline = useIsOffline();
  const [busyArtistId, setBusyArtistId] = useState<Id<"artists"> | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "arrival", dayIndex: 0 });
  const [arrivalDraft, setArrivalDraft] = useState<string>("");
  const [arrivalsByDay, setArrivalsByDay] = useState<Map<DayKey, number>>(
    () => new Map(),
  );
  const [sidequestDraft, setSidequestDraft] = useState<{
    open: boolean;
    defaults: SidequestDraft;
  } | null>(null);
  const [resumed, setResumed] = useState(false);
  const justOpenedRef = useRef(false);
  const slotScrollRef = useRef<HTMLDivElement>(null);

  // On open: try to restore saved progress so the user lands back at
  // the step they left. Falls back to a fresh run when there's no
  // member id (shouldn't happen at this point) or no saved state.
  useEffect(() => {
    if (!open) return;
    justOpenedRef.current = true;
    if (!myMemberId) {
      setPhase({ kind: "arrival", dayIndex: 0 });
      setArrivalsByDay(new Map());
      setResumed(false);
      return;
    }
    const saved = loadProgress(myMemberId);
    if (
      saved &&
      saved.phase &&
      ((saved.phase.kind === "arrival" &&
        saved.phase.dayIndex >= 0 &&
        saved.phase.dayIndex < DAYS.length) ||
        (saved.phase.kind === "slot" &&
          saved.phase.dayIndex >= 0 &&
          saved.phase.dayIndex < DAYS.length))
    ) {
      const arrivalsMap = new Map<DayKey, number>();
      for (const [k, v] of Object.entries(saved.arrivalsByDay ?? {})) {
        if (k === "day_1" || k === "day_2" || k === "day_3") {
          if (typeof v === "number" && Number.isFinite(v)) arrivalsMap.set(k, v);
        }
      }
      setArrivalsByDay(arrivalsMap);
      setPhase(saved.phase);
      setResumed(saved.phase.kind !== "arrival" || saved.phase.dayIndex !== 0);
    } else {
      setPhase({ kind: "arrival", dayIndex: 0 });
      setArrivalsByDay(new Map());
      setResumed(false);
    }
  }, [open, myMemberId]);

  // Persist progress on every state transition while the dialog is
  // open, but skip the very first effect cycle right after opening so
  // we don't immediately overwrite the freshly-loaded snapshot with
  // the in-flight render state.
  useEffect(() => {
    if (!open || !myMemberId) return;
    if (justOpenedRef.current) {
      justOpenedRef.current = false;
      return;
    }
    const arrivals: Record<string, number> = {};
    for (const [k, v] of arrivalsByDay) arrivals[k] = v;
    persistProgress(myMemberId, { arrivalsByDay: arrivals, phase });
  }, [open, myMemberId, phase, arrivalsByDay]);

  // Seed the arrival input each time we land on the arrival phase.
  useEffect(() => {
    if (phase.kind !== "arrival") return;
    setArrivalDraft(DEFAULT_ARRIVAL_VALUE);
  }, [phase]);

  // Once the user starts interacting with the slot phase, drop the
  // "Resumed" hint chip — they're past the welcome-back moment.
  useEffect(() => {
    if (!resumed) return;
    if (phase.kind === "arrival" && phase.dayIndex === 0) setResumed(false);
  }, [resumed, phase]);

  // Reset the artist-list scroll to the top whenever we land on a
  // new step. Without this, a long list scrolled to the bottom on
  // step N can keep its scroll position when stepping to N+1, hiding
  // the new content behind a stale viewport offset.
  useEffect(() => {
    if (!open) return;
    const el = slotScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [open, phase]);

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

  function advanceFromSlot(allowEmpty: boolean) {
    if (phase.kind !== "slot") return;
    const day = DAYS[phase.dayIndex];
    const slots = slotsByDay.get(day) ?? [];
    if (!allowEmpty && slots[phase.slotIndex]) {
      const slot = slots[phase.slotIndex];
      const picked = slot.artists.some((a) => myPickedSet.has(a._id));
      if (!picked) return;
    }
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
    if (myMemberId) clearProgress(myMemberId);
    onClose();
  }

  function startOver() {
    if (myMemberId) clearProgress(myMemberId);
    setArrivalsByDay(new Map());
    setPhase({ kind: "arrival", dayIndex: 0 });
    setResumed(false);
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

  async function handleToggle(artistId: Id<"artists">) {
    if (!myMemberId || offline) return;
    setBusyArtistId(artistId);
    try {
      await toggle({ memberId: myMemberId, artistId });
    } finally {
      setBusyArtistId(null);
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
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md gap-0 p-0">
          <DialogHeader className="space-y-2 border-b border-border/40 px-5 pb-3 pt-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-medium text-primary">
                  <Sparkles className="size-3" />
                  Quick pick
                </div>
                {resumed && (
                  <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                    <RotateCcw className="size-2.5" />
                    Resumed
                  </div>
                )}
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

          <div className="flex items-center justify-between gap-2 border-t border-border/40 bg-background/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={backFromArrival}
                disabled={phase.dayIndex === 0}
              >
                Back
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="size-3.5" />
                Exit
              </Button>
              {resumed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startOver}
                  className="text-muted-foreground hover:text-foreground"
                  title="Discard saved progress and start from Day 1"
                >
                  <RotateCcw className="size-3.5" />
                  Start over
                </Button>
              )}
            </div>
            <Button onClick={commitArrival} disabled={!arrivalDraft}>
              Continue <ChevronRight className="size-4" />
            </Button>
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
  const slotPickedCount = currentSlot.artists.filter((a) =>
    myPickedSet.has(a._id),
  ).length;
  const slotIsRange =
    currentSlot.kind === "starts" && currentSlot.endStartMs > currentSlot.startMs;

  const sidequestsAtSlot = (sidequestsByDay.get(day) ?? []).filter(
    (sq) => sq.startMs <= currentSlot.startMs && sq.endMs > currentSlot.startMs,
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg gap-0 p-0">
          <DialogHeader className="space-y-2 border-b border-border/40 px-5 pb-3 pt-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-medium text-primary">
                  <Sparkles className="size-3" />
                  Quick pick
                </div>
                {resumed && (
                  <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                    <RotateCcw className="size-2.5" />
                    Resumed
                  </div>
                )}
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

          <ScrollArea viewportRef={slotScrollRef} className="max-h-[58vh] px-5">
            <div className="space-y-2 py-3">
              {sidequestsAtSlot.length > 0 && (
                <div className="space-y-1.5 rounded-lg border border-violet-500/30 bg-violet-500/5 p-2.5">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-violet-300">
                    Your sidequests at this time
                  </div>
                  <ul className="space-y-1">
                    {sidequestsAtSlot.map((sq) => (
                      <li
                        key={sq._id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="truncate font-medium text-violet-200">
                          {sq.title}
                        </span>
                        <span className="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
                          {formatTime(sq.startMs)}–{formatTime(sq.endMs)}
                        </span>
                      </li>
                    ))}
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
          </ScrollArea>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-background/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={backFromSlot}>
                Back
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="size-3.5" />
                Exit
              </Button>
              {resumed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startOver}
                  className="text-muted-foreground hover:text-foreground"
                  title="Discard saved progress and start from Day 1"
                >
                  <RotateCcw className="size-3.5" />
                  Start over
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => advanceFromSlot(true)}
                title="Skip this time — handy if you'll arrive later"
              >
                Skip this time
              </Button>
              <Button
                onClick={() => advanceFromSlot(false)}
                disabled={slotPickedCount === 0 || offline}
                title={
                  slotPickedCount === 0
                    ? "Pick at least one artist to continue"
                    : undefined
                }
              >
                {isLastDayLastSlot ? "Done" : "Continue to next"}
                {!isLastDayLastSlot && <ChevronRight className="size-4" />}
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
