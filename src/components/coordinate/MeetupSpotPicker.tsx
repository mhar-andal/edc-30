import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Check, Clock, MapPin, Plus, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { useIsOffline } from "@/lib/useIsOffline";
import {
  applyTimeToAnchor,
  formatTime,
  msToTimeInput,
  type DayKey,
} from "@/lib/time";
import { cn } from "@/lib/utils";

const DEFAULT_SPOTS = [
  "Electric Avenue Sign",
  "Basspod GA Bathrooms",
  "Kinetic Field Entrance",
] as const;

interface Props {
  day: DayKey;
  windowStart: number;
  windowEnd: number;
  destinationStage: string;
  existing: Doc<"meetups"> | undefined;
  myMemberId: import("../../../convex/_generated/dataModel").Id<"members"> | null;
}

/**
 * One-tap meet-spot + meet-time chooser. Two independently-editable
 * sections: a row of landmark chips for the location, and a single
 * time field for the specific moment to converge. Anyone can change
 * either; the two are persisted via separate mutations so concurrent
 * edits to different fields don't clobber each other.
 *
 * No editor dialog — both controls are inline. Disabled offline.
 */
export function MeetupSpotPicker({
  day,
  windowStart,
  windowEnd,
  destinationStage,
  existing,
  myMemberId,
}: Props) {
  const setSpot = useMutation(api.meetups.setSpot);
  const setMeetTime = useMutation(api.meetups.setMeetTime);
  const offline = useIsOffline();
  const labelsList = useCachedQuery(api.meetups.listLabels) ?? [];
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherDraft, setOtherDraft] = useState("");
  const otherInputRef = useRef<HTMLInputElement | null>(null);

  const [timeBusy, setTimeBusy] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeDraft, setTimeDraft] = useState("");
  const timeInputRef = useRef<HTMLInputElement | null>(null);

  // Build the chip list: defaults first, then any extra labels people
  // have used elsewhere, sorted by frequency. Always include the
  // currently-selected label even if it's brand new.
  const chips = useMemo(() => {
    const set = new Set<string>(DEFAULT_SPOTS);
    for (const { label } of labelsList) set.add(label);
    if (existing?.label) set.add(existing.label);
    return Array.from(set);
  }, [labelsList, existing?.label]);

  const chosenLabel = existing?.label ?? null;
  const chosenMeetMs = existing?.meetMs ?? null;
  const disabled = offline || !myMemberId;

  useEffect(() => {
    if (otherOpen) setTimeout(() => otherInputRef.current?.focus(), 0);
    else setOtherDraft("");
  }, [otherOpen]);

  useEffect(() => {
    if (timeOpen) setTimeout(() => timeInputRef.current?.focus(), 0);
  }, [timeOpen]);

  async function pickSpot(label: string) {
    if (disabled) return;
    setBusyLabel(label);
    try {
      if (chosenLabel === label) {
        await setSpot({
          day,
          windowStartMs: windowStart,
          windowEndMs: windowEnd,
          destinationStage,
          label: undefined,
        });
      } else {
        await setSpot({
          day,
          windowStartMs: windowStart,
          windowEndMs: windowEnd,
          destinationStage,
          label,
        });
      }
    } finally {
      setBusyLabel(null);
    }
  }

  async function commitOther() {
    const trimmed = otherDraft.trim();
    if (!trimmed || disabled) return;
    setOtherOpen(false);
    await pickSpot(trimmed);
  }

  function openTimeEditor() {
    const seedMs = chosenMeetMs ?? Math.round((windowStart + windowEnd) / 2);
    setTimeDraft(msToTimeInput(seedMs));
    setTimeOpen(true);
  }

  async function commitTime() {
    if (disabled || !timeDraft) {
      setTimeOpen(false);
      return;
    }
    const candidate = applyTimeToAnchor(timeDraft, windowStart);
    const clamped = Math.min(Math.max(candidate, windowStart), windowEnd);
    setTimeBusy(true);
    setTimeOpen(false);
    try {
      await setMeetTime({
        day,
        windowStartMs: windowStart,
        windowEndMs: windowEnd,
        destinationStage,
        meetMs: clamped,
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
      });
    } finally {
      setTimeBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <MapPin className="size-3" />
          Meet at
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((label) => {
            const isChosen = chosenLabel === label;
            const isBusy = busyLabel === label;
            return (
              <button
                key={label}
                type="button"
                disabled={disabled || isBusy}
                onClick={() => pickSpot(label)}
                title={
                  offline
                    ? "Offline — reconnect to change the meet spot"
                    : isChosen
                      ? "Tap again to clear"
                      : `Set meet spot to ${label}`
                }
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  isChosen
                    ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-500/50 hover:bg-emerald-500/30"
                    : "border border-border/60 bg-background/40 text-foreground hover:bg-background",
                )}
              >
                {isChosen && <Check className="size-3" />}
                {label}
              </button>
            );
          })}
          {!otherOpen ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setOtherOpen(true)}
              title={
                offline
                  ? "Offline — reconnect to add a custom spot"
                  : "Add a custom meet spot"
              }
              className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border/60 bg-background/40 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-3" />
              Other
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <Input
                ref={otherInputRef}
                value={otherDraft}
                onChange={(e) => setOtherDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitOther();
                  }
                  if (e.key === "Escape") setOtherOpen(false);
                }}
                placeholder="e.g. by the LED tower"
                maxLength={48}
                className="h-7 w-44 px-2 text-[11px]"
              />
              <button
                type="button"
                onClick={() => void commitOther()}
                disabled={!otherDraft.trim() || disabled}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                aria-label="Save custom spot"
              >
                <Check className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => setOtherOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Cancel"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Clock className="size-3" />
          At
        </div>
        {timeOpen ? (
          <div className="flex items-center gap-1.5">
            <Input
              ref={timeInputRef}
              type="time"
              value={timeDraft}
              onChange={(e) => setTimeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitTime();
                }
                if (e.key === "Escape") setTimeOpen(false);
              }}
              className="h-7 w-28 px-2 text-[11px] tabular-nums"
            />
            <button
              type="button"
              onClick={() => void commitTime()}
              disabled={!timeDraft || disabled}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
              aria-label="Save time"
            >
              <Check className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => setTimeOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Cancel"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : chosenMeetMs !== null ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={disabled || timeBusy}
              onClick={openTimeEditor}
              title={
                offline ? "Offline — reconnect to change the time" : "Edit time"
              }
              className="inline-flex h-7 items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 text-[11px] font-medium tabular-nums text-emerald-100 ring-1 ring-emerald-500/50 transition-colors hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="size-3" />
              {formatTime(chosenMeetMs)}
            </button>
            <button
              type="button"
              disabled={disabled || timeBusy}
              onClick={() => void clearTime()}
              title={offline ? "Offline" : "Clear time"}
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
            title={offline ? "Offline — reconnect" : "Set a specific time"}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border/60 bg-background/40 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-3" />
            Specific time
          </button>
        )}
      </div>
    </div>
  );
}
