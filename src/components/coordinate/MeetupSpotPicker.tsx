import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { ArrowRight, Check, Clock, MapPin, Plus, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberChip } from "@/components/MemberChip";
import { SpotPicker } from "@/components/SpotPicker";
import { MapPicker } from "@/components/map/MapPicker";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { useIsOffline } from "@/lib/useIsOffline";
import { getStagePalette } from "@/lib/colors";
import { indexSpotsByLabel, spotLabelKey } from "@/lib/spots";
import { formatTime, type DayKey } from "@/lib/time";
import { cn } from "@/lib/utils";

const SLOT_MS = 15 * 60 * 1000;
const DEFAULT_MEET_DURATION_MS = 15 * 60 * 1000;
/**
 * How far back (before the convergence window starts) the gather
 * dropdown is allowed to go, and how far past the end the leave
 * dropdown is allowed to extend. The chip rows stay anchored to
 * the window itself, but the dropdowns are "flex" pickers —
 * useful when people want to gather a bit early or hang at the
 * spot a bit longer than the destination set's nominal start.
 */
const GATHER_LEAD_MS = 60 * 60 * 1000;
const LEAVE_TRAIL_MS = 60 * 60 * 1000;
/**
 * Minute offsets surfaced as "leave time" chips (relative to the
 * gather time). Anchoring on duration rather than absolute clock time
 * makes the "how long are we hanging out at the spot" decision the
 * primary one.
 */
const LEAVE_OFFSETS_MIN = [5, 10, 15, 20, 30, 45, 60, 90] as const;

function formatOffsetMin(min: number): string {
  if (min < 60) return `+${min}m`;
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  if (rest === 0) return `+${hours}h`;
  return `+${hours}h ${rest}m`;
}

export interface MeetTimeOriginGroup {
  artistName: string;
  stage: string;
  endMs: number;
  members: Array<{
    id: string;
    name: string;
    color: string;
    isYou: boolean;
  }>;
}

export interface MeetTimeContext {
  destinationArtistName: string;
  destinationStage: string;
  destinationStartMs: number;
  origins: MeetTimeOriginGroup[];
}

interface Props {
  day: DayKey;
  windowStart: number;
  windowEnd: number;
  destinationStage: string;
  existing: Doc<"meetups"> | undefined;
  myMemberId: import("../../../convex/_generated/dataModel").Id<"members"> | null;
  /**
   * Reference info shown inside the meet-time dialog so people can see
   * the set end times they're leaving and the destination set start
   * time they're heading to. Optional — the time editor still works
   * without it, just without the contextual stage list.
   */
  timeContext?: MeetTimeContext;
}

/**
 * One-tap meet-spot + meet-time chooser. Two independently-editable
 * sections: a row of landmark chips for the location (inline), and a
 * dialog-driven time picker that surfaces relevant set end/start times
 * so people can pick a meet time with the right context. Anyone can
 * change either; the two are persisted via separate mutations so
 * concurrent edits to different fields don't clobber each other.
 *
 * Disabled offline.
 */
export function MeetupSpotPicker({
  day,
  windowStart,
  windowEnd,
  destinationStage,
  existing,
  myMemberId,
  timeContext,
}: Props) {
  const setSpot = useMutation(api.meetups.setSpot);
  const setMeetTime = useMutation(api.meetups.setMeetTime);
  const offline = useIsOffline();
  const meetupLabels = useCachedQuery(api.meetups.listLabels) ?? [];
  const sidequestLabels = useCachedQuery(api.sidequests.listLabels) ?? [];
  const spots = useCachedQuery(api.spots.list) ?? [];

  const [timeBusy, setTimeBusy] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [draftStartMs, setDraftStartMs] = useState<number | null>(null);
  const [draftEndMs, setDraftEndMs] = useState<number | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  // Combine known labels from convergences and sidequests so people
  // see everywhere they've previously met up, sorted by combined
  // frequency. The SpotPicker handles dedup.
  const knownLabels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { label, count } of meetupLabels) {
      counts.set(label, (counts.get(label) ?? 0) + count);
    }
    for (const { label, count } of sidequestLabels) {
      counts.set(label, (counts.get(label) ?? 0) + count);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label]) => label);
  }, [meetupLabels, sidequestLabels]);

  const chosenLabel = existing?.label ?? null;
  const chosenMeetMs = existing?.meetMs ?? null;
  const chosenMeetEndMs = existing?.meetEndMs ?? null;
  const disabled = offline || !myMemberId;

  // Spot bound to the current convergence label, if any. Pins live
  // on the spots table keyed by label so they're shared across every
  // meetup/sidequest that uses the same label.
  const spotsByLabel = useMemo(() => indexSpotsByLabel(spots), [spots]);
  const chosenSpot = chosenLabel
    ? (spotsByLabel.get(spotLabelKey(chosenLabel)) ?? null)
    : null;

  async function handleSpotChange(next: string | null) {
    if (disabled) return;
    await setSpot({
      day,
      windowStartMs: windowStart,
      windowEndMs: windowEnd,
      destinationStage,
      label: next ?? undefined,
      actorMemberId: myMemberId ?? undefined,
    });
  }

  function openTimeEditor() {
    const start =
      chosenMeetMs !== null
        ? Math.round(chosenMeetMs / SLOT_MS) * SLOT_MS
        : null;
    let end: number | null = null;
    if (start !== null) {
      if (chosenMeetEndMs !== null) {
        // Snap an existing leave time to the closest minute offset
        // chip so the dialog shows it as selected.
        const deltaMin = Math.max(
          0,
          Math.round((chosenMeetEndMs - start) / 60000),
        );
        const closest = LEAVE_OFFSETS_MIN.reduce((best, candidate) =>
          Math.abs(candidate - deltaMin) < Math.abs(best - deltaMin)
            ? candidate
            : best,
        );
        end = Math.min(start + closest * 60000, windowEnd);
      } else {
        end = Math.min(start + DEFAULT_MEET_DURATION_MS, windowEnd);
      }
    }
    setDraftStartMs(start);
    setDraftEndMs(end);
    setTimeOpen(true);
  }

  async function commitTime() {
    if (disabled || draftStartMs === null) {
      setTimeOpen(false);
      return;
    }
    // Allow up to GATHER_LEAD_MS before the convergence window
    // (early gather) and up to LEAVE_TRAIL_MS after (linger at the
    // spot). Leave time still has to be ≥ start.
    const start = Math.min(
      Math.max(draftStartMs, windowStart - GATHER_LEAD_MS),
      windowEnd + LEAVE_TRAIL_MS,
    );
    const end =
      draftEndMs === null
        ? undefined
        : Math.min(
            Math.max(draftEndMs, start),
            windowEnd + LEAVE_TRAIL_MS,
          );
    setTimeBusy(true);
    setTimeOpen(false);
    try {
      await setMeetTime({
        day,
        windowStartMs: windowStart,
        windowEndMs: windowEnd,
        destinationStage,
        meetMs: start,
        meetEndMs: end,
        actorMemberId: myMemberId ?? undefined,
      });
    } finally {
      setTimeBusy(false);
    }
  }

  async function clearTime() {
    if (disabled) return;
    setTimeBusy(true);
    try {
      await setMeetTime({
        day,
        windowStartMs: windowStart,
        windowEndMs: windowEnd,
        destinationStage,
        meetMs: undefined,
        meetEndMs: undefined,
        actorMemberId: myMemberId ?? undefined,
      });
    } finally {
      setTimeBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <SpotPicker
        value={chosenLabel}
        onChange={handleSpotChange}
        knownLabels={knownLabels}
        disabled={disabled}
        disabledReason={
          offline ? "Offline — reconnect to change the meet spot" : undefined
        }
      />

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Clock className="size-3" />
          Meet window
        </div>
        {chosenMeetMs !== null ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={disabled || timeBusy}
              onClick={openTimeEditor}
              title={
                offline
                  ? "Offline — reconnect to change the time"
                  : "Edit meet window"
              }
              className="inline-flex h-7 items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 text-[11px] font-medium tabular-nums text-emerald-100 ring-1 ring-emerald-500/50 transition-colors hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="size-3" />
              {chosenMeetEndMs !== null && chosenMeetEndMs > chosenMeetMs
                ? `${formatTime(chosenMeetMs)} – ${formatTime(chosenMeetEndMs)}`
                : `${formatTime(chosenMeetMs)} (no leave time)`}
            </button>
            <button
              type="button"
              disabled={disabled || timeBusy}
              onClick={() => void clearTime()}
              title={offline ? "Offline" : "Clear meet window"}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Clear meet time"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled || timeBusy}
            onClick={openTimeEditor}
            title={offline ? "Offline — reconnect" : "Set a meet window"}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border/60 bg-background/40 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-3" />
            Set meet window
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <MapPin className="size-3" />
          Map pin
        </div>
        {!chosenLabel ? (
          <p className="text-[11px] text-muted-foreground">
            Pick a meet spot above first — pins are tied to the spot label
            so everyone who uses the same spot reuses the pin.
          </p>
        ) : chosenSpot ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMapOpen(true)}
            title={
              offline
                ? "Offline — reconnect to change the map pin"
                : `Edit pin for ${chosenLabel}`
            }
            className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium tabular-nums text-foreground ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: `${chosenSpot.pinColor}33`,
              boxShadow: `inset 0 0 0 1px ${chosenSpot.pinColor}80`,
            }}
          >
            <span
              aria-hidden
              className="size-2 rounded-full ring-1 ring-background"
              style={{ backgroundColor: chosenSpot.pinColor }}
            />
            Pinned at {(chosenSpot.mapX * 100).toFixed(0)}%,{" "}
            {(chosenSpot.mapY * 100).toFixed(0)}%
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMapOpen(true)}
            title={
              offline
                ? "Offline — reconnect"
                : `Drop a pin for ${chosenLabel}`
            }
            className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border/60 bg-background/40 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-3" />
            Pin "{chosenLabel}" on map
          </button>
        )}
      </div>

      <MeetTimeDialog
        open={timeOpen}
        onOpenChange={(o) => {
          if (timeBusy) return;
          setTimeOpen(o);
        }}
        draftStartMs={draftStartMs}
        setDraftStartMs={setDraftStartMs}
        draftEndMs={draftEndMs}
        setDraftEndMs={setDraftEndMs}
        onCommit={commitTime}
        timeBusy={timeBusy}
        disabled={disabled}
        windowStart={windowStart}
        windowEnd={windowEnd}
        timeContext={timeContext}
      />

      {chosenLabel && (
        <MapPicker
          open={mapOpen}
          onOpenChange={setMapOpen}
          label={chosenLabel}
          myMemberId={myMemberId}
        />
      )}
    </div>
  );
}

interface MeetTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftStartMs: number | null;
  setDraftStartMs: (v: number | null) => void;
  draftEndMs: number | null;
  setDraftEndMs: (v: number | null) => void;
  onCommit: () => Promise<void> | void;
  timeBusy: boolean;
  disabled: boolean;
  windowStart: number;
  windowEnd: number;
  timeContext?: MeetTimeContext;
}

function MeetTimeDialog({
  open,
  onOpenChange,
  draftStartMs,
  setDraftStartMs,
  draftEndMs,
  setDraftEndMs,
  onCommit,
  timeBusy,
  disabled,
  windowStart,
  windowEnd,
  timeContext,
}: MeetTimeDialogProps) {
  const destPalette = timeContext
    ? getStagePalette(timeContext.destinationStage)
    : null;

  // Slot range:
  //   from the earliest origin set's end (the first person becomes
  //     available)
  //   to the destination set's start (need to be there before it
  //     begins)
  // This way every relevant set transition gets a slot, and each one
  // can be annotated with which set ends/starts there. Falls back to
  // the full convergence window if the context is missing or the
  // resulting range would be empty.
  const slots = useMemo(() => {
    let lower = windowStart;
    let upper = windowEnd;
    if (timeContext) {
      if (timeContext.origins.length > 0) {
        const minEnd = Math.min(
          ...timeContext.origins.map((o) => o.endMs),
        );
        if (minEnd >= windowStart && minEnd < windowEnd) lower = minEnd;
      }
      const destStart = timeContext.destinationStartMs;
      if (destStart > windowStart && destStart <= windowEnd) {
        upper = destStart;
      }
    }
    if (upper <= lower) {
      lower = windowStart;
      upper = windowEnd;
    }
    const first = Math.ceil(lower / SLOT_MS) * SLOT_MS;
    const last = Math.floor(upper / SLOT_MS) * SLOT_MS;
    const out: number[] = [];
    for (let t = first; t <= last; t += SLOT_MS) {
      if (t >= windowStart && t <= windowEnd) out.push(t);
    }
    if (out.length === 0) out.push(windowStart);
    return out;
  }, [windowStart, windowEnd, timeContext]);

  // Build a quick lookup of which slot times line up with a key
  // reference time so we can annotate the chip.
  const slotAnnotations = useMemo(() => {
    const map = new Map<number, string>();
    if (!timeContext) return map;
    for (const o of timeContext.origins) {
      const snapped = Math.round(o.endMs / SLOT_MS) * SLOT_MS;
      const existing = map.get(snapped);
      const label = `${o.artistName} ends`;
      map.set(snapped, existing ? `${existing} · ${label}` : label);
    }
    const destSnapped =
      Math.round(timeContext.destinationStartMs / SLOT_MS) * SLOT_MS;
    const destLabel = `${timeContext.destinationArtistName} starts`;
    const existing = map.get(destSnapped);
    map.set(destSnapped, existing ? `${existing} · ${destLabel}` : destLabel);
    return map;
  }, [timeContext]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md gap-3 p-5 sm:p-6">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-emerald-300" />
            Pick a meet time
          </DialogTitle>
          <DialogDescription className="text-xs">
            Window {formatTime(windowStart)} – {formatTime(windowEnd)}
          </DialogDescription>
        </DialogHeader>

        {timeContext && timeContext.origins.length > 0 && (
          <section className="space-y-1.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Set end times
            </div>
            <ul className="space-y-1">
              {timeContext.origins.map((o) => {
                const palette = getStagePalette(o.stage);
                return (
                  <li
                    key={`${o.stage}-${o.artistName}-${o.endMs}`}
                    className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5"
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: `rgb(${palette.rgb})` }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="truncate text-xs font-medium">
                          {o.artistName}
                        </span>
                        <span
                          className="truncate text-[10px]"
                          style={{ color: `rgb(${palette.rgb})` }}
                        >
                          · {o.stage}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        {o.members.map((m) => (
                          <MemberChip
                            key={m.id}
                            name={m.name}
                            color={m.color}
                            size="xs"
                            isYou={m.isYou}
                            truncate
                          />
                        ))}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
                      ends {formatTime(o.endMs)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {timeContext && destPalette && (
          <section className="space-y-1.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Heading to
            </div>
            <div
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5"
              style={{
                backgroundColor: `rgb(${destPalette.rgb} / 0.12)`,
                boxShadow: `inset 0 0 0 1px rgb(${destPalette.rgb} / 0.4)`,
                color: `rgb(${destPalette.rgb})`,
              }}
            >
              <ArrowRight className="size-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">
                  {timeContext.destinationArtistName}
                </div>
                <div className="truncate text-[10px] opacity-80">
                  {timeContext.destinationStage}
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums opacity-90">
                starts {formatTime(timeContext.destinationStartMs)}
              </span>
            </div>
          </section>
        )}

        <section className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Gather at the spot
          </div>
          <div className="flex flex-wrap gap-1.5">
            {slots.map((slotMs) => {
              const isSelected = draftStartMs === slotMs;
              const annotation = slotAnnotations.get(slotMs);
              return (
                <button
                  key={slotMs}
                  type="button"
                  onClick={() => {
                    setDraftStartMs(slotMs);
                    // Snap end forward if it's now before start.
                    if (draftEndMs !== null && draftEndMs < slotMs) {
                      setDraftEndMs(
                        Math.min(slotMs + DEFAULT_MEET_DURATION_MS, windowEnd),
                      );
                    } else if (draftEndMs === null) {
                      setDraftEndMs(
                        Math.min(slotMs + DEFAULT_MEET_DURATION_MS, windowEnd),
                      );
                    }
                  }}
                  title={annotation}
                  className={cn(
                    "inline-flex flex-col items-center rounded-md px-2.5 py-1.5 text-[12px] font-medium tabular-nums transition-colors",
                    isSelected
                      ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-500/50"
                      : "border border-border/60 bg-background/40 text-foreground hover:bg-background",
                  )}
                >
                  <span>{formatTime(slotMs)}</span>
                  {annotation && (
                    <span
                      className={cn(
                        "mt-0.5 max-w-[9rem] truncate text-[9px] font-normal uppercase tracking-wide",
                        isSelected
                          ? "text-emerald-200/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {annotation}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <CustomTimeRow
            label="Custom gather"
            valueMs={draftStartMs}
            min={windowStart - GATHER_LEAD_MS}
            max={windowEnd}
            onChange={(nextMs) => {
              setDraftStartMs(nextMs);
              if (nextMs !== null) {
                if (draftEndMs === null || draftEndMs < nextMs) {
                  setDraftEndMs(
                    Math.min(nextMs + DEFAULT_MEET_DURATION_MS, windowEnd),
                  );
                }
              }
            }}
          />
        </section>

        <section className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Leave for {timeContext?.destinationArtistName ?? "next set"}
            </div>
            {draftEndMs !== null && (
              <button
                type="button"
                onClick={() => setDraftEndMs(null)}
                className="text-[10px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          {draftStartMs === null ? (
            <p className="text-[11px] text-muted-foreground">
              Pick a gather time first.
            </p>
          ) : (
            <>
              <LeaveOffsetChips
                startMs={draftStartMs}
                draftEndMs={draftEndMs}
                setDraftEndMs={setDraftEndMs}
                windowEnd={windowEnd}
              />
              <CustomTimeRow
                label="Custom leave"
                valueMs={draftEndMs}
                min={draftStartMs}
                // Allow lingering up to LEAVE_TRAIL_MS past the
                // convergence window's nominal end, so groups can
                // hang out at the spot a bit longer than the buffer
                // suggests.
                max={windowEnd + LEAVE_TRAIL_MS}
                allowClear
                onChange={setDraftEndMs}
              />
            </>
          )}
        </section>

        <DialogFooter className="gap-2 pt-1 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={timeBusy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onCommit()}
            disabled={draftStartMs === null || disabled || timeBusy}
          >
            {timeBusy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * Native `<select>` listing every 5-minute slot inside the meetup
 * window. We deliberately do NOT use `<input type="time">` here:
 * iOS Safari treats `min > max` as "no valid time" for any window
 * that crosses midnight (extremely common for late-night
 * convergences), which makes the picker silently refuse typed
 * values. A native select side-steps that entirely — it's also a
 * familiar wheel UI on iOS, so picking a precise time is one tap +
 * one scroll instead of fighting an invalid clock face.
 *
 * The current `valueMs` is preserved as an option even when it
 * isn't a 5-min boundary, so legacy data (or a value coming from a
 * chip with a non-5-min offset) doesn't get visually clobbered.
 */
function CustomTimeRow({
  label,
  valueMs,
  min,
  max,
  onChange,
  allowClear = false,
}: {
  label: string;
  valueMs: number | null;
  min: number;
  max: number;
  onChange: (nextMs: number | null) => void;
  allowClear?: boolean;
}) {
  const options = useMemo(() => {
    if (max <= min) return [min];
    const start = Math.ceil(min / FIVE_MIN_MS) * FIVE_MIN_MS;
    const end = Math.floor(max / FIVE_MIN_MS) * FIVE_MIN_MS;
    const out: number[] = [];
    for (let t = start; t <= end; t += FIVE_MIN_MS) {
      if (t >= min && t <= max) out.push(t);
    }
    if (out.length === 0) out.push(min);
    // Surface the bounds explicitly even if they aren't 5-min
    // multiples, so the user can still pick exactly the window
    // edge.
    if (out[0] !== min) out.unshift(min);
    if (out[out.length - 1] !== max) out.push(max);
    return out;
  }, [min, max]);

  const selectValue = valueMs !== null ? String(valueMs) : "";
  const valueIsKnown =
    valueMs !== null && options.some((ms) => ms === valueMs);

  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        value={selectValue}
        onChange={(e) => {
          const raw = e.target.value;
          if (!raw) {
            if (allowClear) onChange(null);
            return;
          }
          const next = Number.parseInt(raw, 10);
          if (Number.isFinite(next)) onChange(next);
        }}
        className={cn(
          "h-7 rounded-md border border-border/60 bg-background/40 px-2 text-[12px] tabular-nums text-foreground",
          "focus:outline-none focus:ring-1 focus:ring-emerald-500/50",
        )}
        aria-label={label}
      >
        {allowClear && <option value="">— Pick —</option>}
        {!allowClear && valueMs === null && (
          <option value="" disabled>
            — Pick —
          </option>
        )}
        {/* Preserve a non-5-min legacy / chip value so it shows up
            as the current selection without being silently dropped. */}
        {valueMs !== null && !valueIsKnown && (
          <option value={String(valueMs)}>{formatTime(valueMs)}</option>
        )}
        {options.map((ms) => (
          <option key={ms} value={String(ms)}>
            {formatTime(ms)}
          </option>
        ))}
      </select>
      {allowClear && valueMs !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function LeaveOffsetChips({
  startMs,
  draftEndMs,
  setDraftEndMs,
  windowEnd,
}: {
  startMs: number;
  draftEndMs: number | null;
  setDraftEndMs: (v: number | null) => void;
  windowEnd: number;
}) {
  const offsets = useMemo(() => {
    const out: Array<{ minutes: number; ms: number; clipped: boolean }> = [];
    for (const minutes of LEAVE_OFFSETS_MIN) {
      const raw = startMs + minutes * 60_000;
      if (raw > windowEnd) {
        // Surface the final option clipped to windowEnd, but only
        // once — and only if no earlier offset already lands there.
        const last = out[out.length - 1];
        if (!last || last.ms < windowEnd) {
          out.push({ minutes, ms: windowEnd, clipped: true });
        }
        break;
      }
      out.push({ minutes, ms: raw, clipped: false });
    }
    return out;
  }, [startMs, windowEnd]);

  if (offsets.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No room to stay — gather time is at the edge of the window.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {offsets.map(({ minutes, ms, clipped }) => {
        const isSelected = draftEndMs === ms;
        return (
          <button
            key={`${minutes}-${ms}`}
            type="button"
            onClick={() => setDraftEndMs(ms)}
            title={`Leave at ${formatTime(ms)}`}
            className={cn(
              "inline-flex flex-col items-center rounded-md px-2.5 py-1.5 text-[12px] font-semibold tabular-nums transition-colors",
              isSelected
                ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-500/50"
                : "border border-border/60 bg-background/40 text-foreground hover:bg-background",
            )}
          >
            <span>{formatOffsetMin(minutes)}</span>
            <span
              className={cn(
                "mt-0.5 text-[10px] font-normal",
                isSelected ? "text-emerald-200/80" : "text-muted-foreground",
              )}
            >
              {clipped ? `until ${formatTime(ms)}` : formatTime(ms)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
