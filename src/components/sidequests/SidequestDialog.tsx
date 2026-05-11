import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SpotPicker } from "@/components/SpotPicker";
import { MapPicker } from "@/components/map/MapPicker";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { useIsOffline } from "@/lib/useIsOffline";
import { indexSpotsByLabel, spotLabelKey } from "@/lib/spots";
import {
  DAY_LABELS,
  applyTimeToAnchor,
  clampMs,
  FESTIVAL_DAY_RANGE_MS,
  formatTime,
  msToTimeInput,
  type DayKey,
} from "@/lib/time";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const SNAP_MINUTES = 15;
const SNAP_MS = SNAP_MINUTES * 60 * 1000;

/**
 * Snap to the nearest 15-minute boundary. Used when seeding initial
 * times from a desktop drag selection; the user can fine-tune in the
 * dialog's time inputs (which themselves are 1-min granularity).
 */
export function snap15(ms: number): number {
  return Math.round(ms / SNAP_MS) * SNAP_MS;
}

export interface SidequestDraft {
  day: DayKey;
  startMs: number;
  endMs: number;
  title: string;
  location: string;
  notes: string;
}

type Mode =
  | { kind: "create"; defaults: SidequestDraft }
  | {
      kind: "edit";
      sidequestId: Id<"sidequests">;
      defaults: SidequestDraft;
    };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  myMemberId: Id<"members"> | null;
}

export function SidequestDialog({
  open,
  onOpenChange,
  mode,
  myMemberId,
}: Props) {
  const create = useMutation(api.sidequests.create);
  const update = useMutation(api.sidequests.update);
  const remove = useMutation(api.sidequests.remove);
  const offline = useIsOffline();
  const meetupLabels = useCachedQuery(api.meetups.listLabels) ?? [];
  const sidequestLabels = useCachedQuery(api.sidequests.listLabels) ?? [];

  const [draft, setDraft] = useState<SidequestDraft>(mode.defaults);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  // Pin (if any) for the current Meet-at label. Pins are stored on
  // the shared `spots` table keyed by label, so the UI surface here
  // is the same one the convergence picker uses.
  const spots = useCachedQuery(api.spots.list) ?? [];
  const spotsByLabel = useMemo(() => indexSpotsByLabel(spots), [spots]);
  const trimmedLocation = draft.location.trim();
  const chosenSpot = trimmedLocation
    ? (spotsByLabel.get(spotLabelKey(trimmedLocation)) ?? null)
    : null;

  // Combine spot suggestions across both convergence meetups and
  // existing sidequests so people see every place they've previously
  // gathered, ranked by combined frequency.
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

  // Reset form whenever the dialog opens (or the underlying mode changes).
  useEffect(() => {
    if (open) {
      setDraft(mode.defaults);
      setError(null);
    }
  }, [open, mode.defaults]);

  const dayRange = FESTIVAL_DAY_RANGE_MS[draft.day];
  // Anchor at the day's midpoint so applyTimeToAnchor's 12h threshold
  // covers both the early-evening start (e.g. 7pm) and the early-morning
  // end (e.g. 5am) of a festival night without misclassifying either.
  const dayAnchor = useMemo(
    () => Math.floor((dayRange.start + dayRange.end) / 2),
    [dayRange.start, dayRange.end],
  );
  const startInput = useMemo(() => msToTimeInput(draft.startMs), [draft.startMs]);
  const endInput = useMemo(() => msToTimeInput(draft.endMs), [draft.endMs]);

  function setStartFromInput(hhmm: string) {
    const next = clampMs(
      applyTimeToAnchor(hhmm, dayAnchor),
      dayRange.start,
      dayRange.end - 60_000,
    );
    setDraft((d) => {
      const newEnd = Math.max(d.endMs, next + 15 * 60_000);
      return {
        ...d,
        startMs: next,
        endMs: clampMs(newEnd, next + 60_000, dayRange.end),
      };
    });
  }

  function setEndFromInput(hhmm: string) {
    const next = clampMs(
      applyTimeToAnchor(hhmm, dayAnchor),
      dayRange.start + 60_000,
      dayRange.end,
    );
    setDraft((d) => ({
      ...d,
      endMs: Math.max(next, d.startMs + 60_000),
    }));
  }

  async function handleSave() {
    if (!myMemberId) {
      setError("You need to sign in first.");
      return;
    }
    if (offline) {
      setError("Offline — reconnect to save.");
      return;
    }
    const title = draft.title.trim();
    if (!title) {
      setError("Give your sidequest a title.");
      return;
    }
    if (draft.endMs <= draft.startMs) {
      setError("End time must be after start time.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (mode.kind === "create") {
        await create({
          memberId: myMemberId,
          day: draft.day,
          title,
          location: draft.location.trim() || undefined,
          notes: draft.notes.trim() || undefined,
          startMs: draft.startMs,
          endMs: draft.endMs,
        });
      } else {
        await update({
          sidequestId: mode.sidequestId,
          memberId: myMemberId,
          title,
          location: draft.location.trim() || undefined,
          notes: draft.notes.trim() || undefined,
          startMs: draft.startMs,
          endMs: draft.endMs,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (mode.kind !== "edit" || !myMemberId) return;
    if (
      !confirm(
        "Delete this sidequest? Anyone who joined will be removed too.",
      )
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      await remove({ sidequestId: mode.sidequestId, memberId: myMemberId });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  const isCreate = mode.kind === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? "New sidequest" : "Edit sidequest"}
          </DialogTitle>
          <DialogDescription>
            {DAY_LABELS[draft.day].full} ·{" "}
            <span className="tabular-nums">
              {formatTime(draft.startMs)} – {formatTime(draft.endMs)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sq-title">Title</Label>
            <Input
              id="sq-title"
              autoFocus
              value={draft.title}
              maxLength={80}
              placeholder="e.g. Tacos at Camp Q"
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="sq-start">Start</Label>
              <Input
                id="sq-start"
                type="time"
                step={60}
                value={startInput}
                onChange={(e) => setStartFromInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sq-end">End</Label>
              <Input
                id="sq-end"
                type="time"
                step={60}
                value={endInput}
                onChange={(e) => setEndFromInput(e.target.value)}
              />
            </div>
          </div>

          <SpotPicker
            value={draft.location.trim() ? draft.location : null}
            onChange={(next) =>
              setDraft((d) => ({ ...d, location: next ?? "" }))
            }
            knownLabels={knownLabels}
            disabled={offline}
            disabledReason="Offline — reconnect to change the meet spot"
            heading="Meet at (optional)"
          />

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin className="size-3" />
              Map pin (optional)
            </div>
            {!trimmedLocation ? (
              <p className="text-[11px] text-muted-foreground">
                Pick a "Meet at" spot above first — pins are tied to the
                spot label so they're reused everywhere it's used.
              </p>
            ) : chosenSpot ? (
              <button
                type="button"
                onClick={() => setMapOpen(true)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium tabular-nums text-foreground ring-1 transition-colors"
                style={{
                  backgroundColor: `${chosenSpot.pinColor}33`,
                  boxShadow: `inset 0 0 0 1px ${chosenSpot.pinColor}80`,
                }}
                title={`Edit pin for ${trimmedLocation}`}
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
                onClick={() => setMapOpen(true)}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border/60 bg-background/40 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                title={`Drop a pin for ${trimmedLocation}`}
              >
                <Plus className="size-3" />
                Pin "{trimmedLocation}" on map
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sq-notes">Notes (optional)</Label>
            <textarea
              id="sq-notes"
              value={draft.notes}
              maxLength={500}
              rows={3}
              placeholder="Anything else friends should know"
              onChange={(e) =>
                setDraft((d) => ({ ...d, notes: e.target.value }))
              }
              className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          {offline && (
            <p className="text-xs text-amber-300">
              Offline — reconnect to save.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {!isCreate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={offline || deleting || saving}
                className="text-destructive hover:text-destructive"
              >
                {deleting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving || deleting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={offline || saving || deleting || !myMemberId}
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {isCreate ? "Create" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      {trimmedLocation && (
        <MapPicker
          open={mapOpen}
          onOpenChange={setMapOpen}
          label={trimmedLocation}
          myMemberId={myMemberId}
        />
      )}
    </Dialog>
  );
}
