import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Clock, Loader2, MapPin, Pencil, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { useIsOffline } from "@/lib/useIsOffline";
import {
  applyTimeToAnchor,
  clampMs,
  formatTime,
  msToTimeInput,
  type DayKey,
} from "@/lib/time";

interface Props {
  day: DayKey;
  windowStart: number;
  windowEnd: number;
  memberAId: Id<"members">;
  memberBId: Id<"members">;
  existing: Doc<"meetups"> | undefined;
  myMemberId: Id<"members"> | null;
  membersById: Map<string, Doc<"members">>;
}

export const DEFAULT_MEETUP_LABELS = [
  "Electric Avenue Sign",
  "Basspod - GA+ Bathrooms",
] as const;
const CUSTOM_VALUE = "__custom";
const DEFAULT_LABEL_SET = new Set<string>(DEFAULT_MEETUP_LABELS);

export function MeetupEditor({
  day,
  windowStart,
  windowEnd,
  memberAId,
  memberBId,
  existing,
  myMemberId,
  membersById,
}: Props) {
  const upsert = useMutation(api.meetups.upsert);
  const clear = useMutation(api.meetups.clear);
  const offline = useIsOffline();
  const labelsList = useCachedQuery(api.meetups.listLabels) ?? [];

  const knownLabels = useMemo(() => {
    const set = new Set<string>(DEFAULT_MEETUP_LABELS);
    for (const { label } of labelsList) set.add(label);
    return Array.from(set);
  }, [labelsList]);

  const initialLabel = existing?.label || DEFAULT_MEETUP_LABELS[0];
  const initialIsKnown = knownLabels.includes(initialLabel);
  const [pickValue, setPickValue] = useState<string>(
    initialIsKnown ? initialLabel : CUSTOM_VALUE,
  );
  const [customDraft, setCustomDraft] = useState<string>(
    initialIsKnown ? "" : initialLabel,
  );
  const [meetupStartTime, setMeetupStartTime] = useState<string>(
    msToTimeInput(existing?.meetupStartMs ?? windowStart),
  );
  const [meetupEndTime, setMeetupEndTime] = useState<string>(
    msToTimeInput(existing?.meetupEndMs ?? windowEnd),
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = existing?.label || DEFAULT_MEETUP_LABELS[0];
    const nextIsKnown = knownLabels.includes(next);
    setPickValue(nextIsKnown ? next : CUSTOM_VALUE);
    setCustomDraft(nextIsKnown ? "" : next);
    setMeetupStartTime(msToTimeInput(existing?.meetupStartMs ?? windowStart));
    setMeetupEndTime(msToTimeInput(existing?.meetupEndMs ?? windowEnd));
  }, [
    existing?._id,
    existing?.label,
    existing?.meetupStartMs,
    existing?.meetupEndMs,
    knownLabels,
    windowStart,
    windowEnd,
  ]);

  const editor = existing ? membersById.get(existing.editedByMemberId) : null;
  const editedTime = existing ? formatTime(existing.editedAt) : null;

  const finalLabel = (
    pickValue === CUSTOM_VALUE ? customDraft.trim() : pickValue
  ).trim();

  const meetupStartMs = useMemo(() => {
    return clampMs(
      applyTimeToAnchor(meetupStartTime, windowStart),
      windowStart,
      windowEnd,
    );
  }, [meetupStartTime, windowStart, windowEnd]);
  const meetupEndMs = useMemo(() => {
    return clampMs(
      applyTimeToAnchor(meetupEndTime, windowStart),
      windowStart,
      windowEnd,
    );
  }, [meetupEndTime, windowStart, windowEnd]);
  const timeRangeValid = meetupEndMs > meetupStartMs;

  const dirty = useMemo(() => {
    const existingLabel = existing?.label || "";
    if (existing) {
      if (finalLabel !== existingLabel) return true;
      const existingStart = existing.meetupStartMs ?? windowStart;
      const existingEnd = existing.meetupEndMs ?? windowEnd;
      if (meetupStartMs !== existingStart) return true;
      if (meetupEndMs !== existingEnd) return true;
      return false;
    }
    return finalLabel.length > 0;
  }, [
    existing,
    finalLabel,
    meetupStartMs,
    meetupEndMs,
    windowStart,
    windowEnd,
  ]);

  const canSave =
    !busy &&
    !offline &&
    !!myMemberId &&
    dirty &&
    timeRangeValid &&
    finalLabel.length > 0;

  async function save() {
    if (!myMemberId || offline) return;
    setBusy(true);
    try {
      await upsert({
        day,
        windowStartMs: windowStart,
        windowEndMs: windowEnd,
        memberAId,
        memberBId,
        label: finalLabel || undefined,
        meetupStartMs:
          meetupStartMs !== windowStart ? meetupStartMs : undefined,
        meetupEndMs: meetupEndMs !== windowEnd ? meetupEndMs : undefined,
        editedByMemberId: myMemberId,
      });
    } finally {
      setBusy(false);
    }
  }
  async function handleClear() {
    if (offline) return;
    setBusy(true);
    try {
      await clear({
        day,
        windowStartMs: windowStart,
        windowEndMs: windowEnd,
        memberAId,
        memberBId,
      });
      setPickValue(DEFAULT_MEETUP_LABELS[0]);
      setCustomDraft("");
      setMeetupStartTime(msToTimeInput(windowStart));
      setMeetupEndTime(msToTimeInput(windowEnd));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-background/30 p-3">
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <MapPin className="size-3" />
          Location
        </Label>
        <Select value={pickValue} onValueChange={setPickValue}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Pick where to meet" />
          </SelectTrigger>
          <SelectContent>
            {knownLabels.map((label) => (
              <SelectItem key={label} value={label}>
                <span className="flex items-center gap-2">
                  <MapPin className="size-3 text-emerald-300" />
                  {label}
                  {DEFAULT_LABEL_SET.has(label) && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      default
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_VALUE}>
              <span className="flex items-center gap-2">
                <Pencil className="size-3" />
                Custom location…
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        {pickValue === CUSTOM_VALUE && (
          <Input
            autoFocus={!customDraft}
            placeholder="e.g. main entrance, by the LED tower"
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            maxLength={120}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Clock className="size-3" />
          Time
        </Label>
        <div className="flex items-center gap-1.5">
          <Input
            type="time"
            value={meetupStartTime}
            onChange={(e) => setMeetupStartTime(e.target.value)}
            className="h-8 w-[7.5rem] text-xs tabular-nums"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="time"
            value={meetupEndTime}
            onChange={(e) => setMeetupEndTime(e.target.value)}
            className="h-8 w-[7.5rem] text-xs tabular-nums"
          />
        </div>
      </div>
      {!timeRangeValid && (
        <p className="text-[10px] text-amber-300">
          End must be after start, and within {formatTime(windowStart)}–
          {formatTime(windowEnd)}.
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
        <span className="text-[11px] text-muted-foreground">
          {existing
            ? `set by ${editor?.name ?? "—"} at ${editedTime}`
            : pickValue === CUSTOM_VALUE
              ? "Anyone can pick this label later"
              : "Anyone can edit this meetup"}
        </span>
        <div className="flex items-center gap-1.5">
          {existing && (
            <Button
              size="icon"
              variant="ghost"
              onClick={handleClear}
              disabled={busy || offline}
              title={offline ? "Offline — reconnect to edit" : "Clear meetup"}
              className="size-8"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            onClick={save}
            disabled={!canSave}
            title={offline ? "Offline — reconnect to save" : undefined}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : existing ? (
              "Update"
            ) : (
              "Save meetup"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
