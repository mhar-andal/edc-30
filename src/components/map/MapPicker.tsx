import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Check, Loader2, MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_PIN_COLOR,
  PIN_COLORS,
  isValidPinColor,
} from "@/lib/festivalMap";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { spotLabelKey } from "@/lib/spots";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MapView, type MapPin as MapPinShape } from "./MapView";
import { PinMarker } from "./PinMarker";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The meet-spot label this pin is bound to. Pins live on the
   * `spots` table keyed by this label, so pinning "Electric Avenue
   * Sign" once gets reused by every meetup or sidequest that picks
   * the same label. Empty strings are rejected — callers should
   * disable the trigger that opens this picker until a label is set.
   */
  label: string;
  /**
   * Member id used to attribute pin edits in the spot's audit field.
   * Optional because seed/scripted writes may legitimately leave it
   * blank.
   */
  myMemberId: Id<"members"> | null;
}

/**
 * Dialog for pinning a meet-spot on the festival map. Pin coordinates
 * + color live on the shared `spots` table so they're reused
 * everywhere the same label appears (convergences, sidequests, future
 * features).
 *
 * Editing here writes to `spots.setPin` directly — there's no
 * "remember to save" step. Cancel discards in-flight edits to the
 * draft pin/color but doesn't undo any save the user already
 * confirmed.
 */
export function MapPicker({ open, onOpenChange, label, myMemberId }: Props) {
  const allSpots = useCachedQuery(api.spots.list) ?? [];
  const setPin = useMutation(api.spots.setPin);
  const clearPin = useMutation(api.spots.clearPin);

  const trimmedLabel = label.trim();
  const labelKey = spotLabelKey(trimmedLabel);

  const existingSpot = useMemo(
    () => allSpots.find((s) => s.labelKey === labelKey),
    [allSpots, labelKey],
  );

  const [draft, setDraft] = useState<{
    x: number;
    y: number;
    color: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the draft from the persisted spot whenever the dialog
  // (re-)opens or the bound label changes mid-session.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    if (existingSpot) {
      setDraft({
        x: existingSpot.mapX,
        y: existingSpot.mapY,
        color: existingSpot.pinColor,
      });
    } else {
      setDraft(null);
    }
  }, [open, existingSpot, labelKey]);

  // Other pinned spots render at lower visual weight underneath the
  // draft so the user can avoid placing two pins on top of each other.
  const contextPins: MapPinShape[] = useMemo(
    () =>
      allSpots
        .filter((s) => s.labelKey !== labelKey)
        .map((s) => ({
          id: s._id,
          x: s.mapX,
          y: s.mapY,
          color: s.pinColor,
          label: s.label,
        })),
    [allSpots, labelKey],
  );

  const draftColor = draft?.color ?? DEFAULT_PIN_COLOR;

  function handleMapTap(point: { x: number; y: number }) {
    setDraft((cur) => ({
      x: point.x,
      y: point.y,
      color: cur?.color ?? DEFAULT_PIN_COLOR,
    }));
  }

  function handleColor(next: string) {
    setDraft((cur) =>
      cur ? { ...cur, color: next } : { x: 0.5, y: 0.5, color: next },
    );
  }

  async function handleSave() {
    if (!draft || !trimmedLabel) return;
    if (!isValidPinColor(draft.color)) return;
    setBusy(true);
    setError(null);
    try {
      await setPin({
        label: trimmedLabel,
        mapX: draft.x,
        mapY: draft.y,
        pinColor: draft.color,
        actorMemberId: myMemberId ?? undefined,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save pin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!trimmedLabel) return;
    setBusy(true);
    setError(null);
    try {
      await clearPin({ label: trimmedLabel });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear pin.");
    } finally {
      setBusy(false);
    }
  }

  // Combine context pins with the in-flight draft so the user sees
  // exactly what they're about to save.
  const mapPins: MapPinShape[] = [
    ...contextPins,
    ...(draft
      ? [
          {
            id: "draft",
            x: draft.x,
            y: draft.y,
            color: draft.color,
            highlight: true,
            label: trimmedLabel || "New pin",
          } satisfies MapPinShape,
        ]
      : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-3rem)] max-w-2xl gap-3 overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4 text-primary" />
            {trimmedLabel
              ? `Pin "${trimmedLabel}" on the map`
              : "Pin a spot on the map"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {existingSpot
              ? "Drag the pin to move it, or pick a new color. Changes apply everywhere this spot is used."
              : "Tap the map to drop your pin. The pin is saved to this label so you don't have to re-pin it."}
          </DialogDescription>
        </DialogHeader>

        <div
          className="mx-auto w-full"
          style={{ maxWidth: "calc(55dvh * 0.8)" }}
        >
          <MapView pins={mapPins} onMapTap={handleMapTap} />
        </div>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Pin color
            </div>
            {draft && (
              <span className="inline-flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
                <span
                  className="inline-block size-2 rounded-full ring-1 ring-border/60"
                  style={{ backgroundColor: draft.color }}
                />
                {(draft.x * 100).toFixed(1)}%, {(draft.y * 100).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PIN_COLORS.map((c) => {
              const active = draftColor.toLowerCase() === c.value.toLowerCase();
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => handleColor(c.value)}
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-full ring-1 ring-border/60 transition-transform",
                    active
                      ? "ring-2 ring-foreground/80 scale-110"
                      : "hover:scale-110",
                  )}
                  style={{ backgroundColor: c.value }}
                  aria-label={c.name}
                  title={c.name}
                >
                  {active && (
                    <Check className="size-4 text-foreground drop-shadow" />
                  )}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Preview
              </span>
              <div
                className="flex size-9 items-end justify-center"
                aria-hidden
              >
                <PinMarker color={draftColor} size={28} />
              </div>
            </div>
          </div>
        </section>

        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 pt-1 sm:justify-between">
          <div>
            {existingSpot && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={busy}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                Remove pin
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!draft || busy || !trimmedLabel}
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Save pin
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
