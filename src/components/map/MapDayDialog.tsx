import { useEffect, useMemo, useState } from "react";
import { ArrowRight, MapPin, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { indexSpotsByLabel, spotLabelKey } from "@/lib/spots";
import { DAY_LABELS, formatRange, formatTime, type DayKey } from "@/lib/time";
import { MapView, type MapPin as MapPinShape } from "./MapView";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: DayKey;
  /**
   * If set, narrow the dialog to a single spot: only the matching
   * pin is rendered (the rest of the day's pins are filtered out)
   * and that pin is pre-highlighted. Used when a meetup card opens
   * the map for "where's *this* spot?". Leave undefined to show
   * every pinned spot for the day.
   */
  focusLabel?: string | null;
}

interface UseEntry {
  kind: "convergence" | "sidequest";
  /** Time summary (`9:30pm – 10:00pm`, or sidequest range). */
  secondary: string;
  /**
   * Convergence-only destination context: which artist + stage the
   * group is heading to. Rendered as a sub-line so it never crowds
   * the time on narrow screens.
   */
  destination?: { artist?: string; stage: string };
}

interface PinEntry {
  spot: Doc<"spots">;
  /**
   * The events on the active day that reference this spot. A pin
   * persists across the whole festival, but the legend only shows
   * the events happening today.
   */
  uses: UseEntry[];
}

/**
 * Read-only festival-map view scoped to a single festival day. Shows
 * every meet-spot referenced by today's meetups + sidequests as a
 * tappable pin, with a scrollable legend underneath listing the
 * events using each spot.
 *
 * Pins are de-duplicated by spot label, so the same "Electric Avenue
 * Sign" pin shows up once even if five convergences point at it.
 *
 * Tapping a pin or a list row pulses the matching pin so it's easy
 * to spot it on a busy map.
 */
export function MapDayDialog({
  open,
  onOpenChange,
  day,
  focusLabel,
}: Props) {
  const meetups = useCachedQuery(api.meetups.listForDay, { day });
  const sidequests = useCachedQuery(api.sidequests.listForDay, { day });
  const spots = useCachedQuery(api.spots.list);
  const artists = useCachedQuery(api.artists.listAll);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Normalize the focus label once so we can both filter entries and
  // pre-arm the highlight against the same key.
  const focusKey = useMemo(() => {
    const trimmed = focusLabel?.trim();
    return trimmed ? spotLabelKey(trimmed) : null;
  }, [focusLabel]);
  const isFocused = focusKey !== null;

  // Whenever the dialog (re-)opens with a focus label, resolve it to
  // the matching spot id and pre-arm the highlight so the pin pulses
  // immediately.
  useEffect(() => {
    if (!open) return;
    if (!focusKey) return;
    const match = (spots ?? []).find((s) => s.labelKey === focusKey);
    setHighlightId(match?._id ?? null);
  }, [open, focusKey, spots]);

  const entries = useMemo<PinEntry[]>(() => {
    const spotsByLabel = indexSpotsByLabel(spots ?? []);
    // Group day events by their spot id so each pin shows up once
    // with all the events that use it.
    const buckets = new Map<string, PinEntry>();

    function record(label: string | undefined, use: UseEntry) {
      if (!label) return;
      const key = spotLabelKey(label);
      if (!key) return;
      // In focus mode we only render the requested spot.
      if (focusKey && key !== focusKey) return;
      const spot = spotsByLabel.get(key);
      if (!spot) return; // No pin → not on the map.
      const existing = buckets.get(spot._id);
      if (existing) {
        existing.uses.push(use);
      } else {
        buckets.set(spot._id, { spot, uses: [use] });
      }
    }

    for (const m of meetups ?? []) {
      record(m.label, {
        kind: "convergence",
        secondary: convergenceSecondary(m),
        destination: {
          artist: resolveDestinationArtist(m, artists ?? [])?.name,
          stage: m.destinationStage,
        },
      });
    }
    for (const s of sidequests ?? []) {
      record(s.location, {
        kind: "sidequest",
        secondary: formatRange(s.startMs, s.endMs),
      });
    }

    // When focusing on a label we still want to render the pin even
    // if it's not referenced by any of today's events (e.g. a spot
    // pinned for tomorrow but tapped from today's meetup card).
    if (focusKey && buckets.size === 0) {
      const spot = spotsByLabel.get(focusKey);
      if (spot) {
        buckets.set(spot._id, { spot, uses: [] });
      }
    }

    return Array.from(buckets.values()).sort((a, b) =>
      a.spot.label.localeCompare(b.spot.label),
    );
  }, [meetups, sidequests, spots, artists, focusKey]);

  // Only the highlighted pin is rendered on the map. This keeps the
  // map clean while the user scans the legend, and means the legend
  // doubles as a "ping this spot" picker. In focus mode the pin is
  // pre-highlighted on open so the user lands on the map already
  // pointing at the spot they tapped from Schedule / Coordinate.
  const mapPins: MapPinShape[] = entries
    .filter((e) => highlightId === e.spot._id)
    .map((e) => ({
      id: e.spot._id,
      x: e.spot.mapX,
      y: e.spot.mapY,
      color: e.spot.pinColor,
      label: e.spot.label,
      highlight: true,
      // In focus mode there's no legend to re-summon the pin, so
      // tapping it is a no-op. In normal mode tapping toggles the
      // highlight off (same as tapping the matching legend row).
      onClick: isFocused
        ? undefined
        : () =>
            setHighlightId((cur) =>
              cur === e.spot._id ? null : e.spot._id,
            ),
    }));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setHighlightId(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-3rem)] max-w-3xl gap-3 overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4 text-primary" />
            {DAY_LABELS[day].full} · Map
          </DialogTitle>
          <DialogDescription className="text-xs">
            {entries.length === 0
              ? isFocused
                ? "This spot doesn't have a pin yet."
                : "No pinned spots yet for this day."
              : isFocused
                ? `Showing ${entries[0].spot.label}. Pinch or scroll to zoom.`
                : `${entries.length} pinned spot${entries.length === 1 ? "" : "s"}. Pinch or scroll to zoom.`}
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto w-full" style={{ maxWidth: "calc(50dvh * 0.8)" }}>
          <MapView pins={mapPins} />
        </div>

        {entries.length > 0 && !isFocused && !highlightId && (
          <p className="text-center text-[11px] text-muted-foreground">
            Tap a spot below to show it on the map.
          </p>
        )}

        {entries.length > 0 && !isFocused && (
          <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {entries.map((e) => {
              const isActive = highlightId === e.spot._id;
              return (
                <li key={e.spot._id}>
                  <button
                    type="button"
                    onClick={() =>
                      setHighlightId((cur) =>
                        cur === e.spot._id ? null : e.spot._id,
                      )
                    }
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                      isActive
                        ? "border-foreground/40 bg-secondary/70"
                        : "border-border/50 bg-card/30 hover:bg-secondary/50",
                    )}
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 size-2.5 shrink-0 rounded-full ring-1 ring-background"
                      style={{ backgroundColor: e.spot.pinColor }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">
                        {e.spot.label}
                      </div>
                      <ul className="mt-0.5 space-y-1 text-[10px] text-muted-foreground">
                        {e.uses.map((u, i) => (
                          <li key={i} className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-x-1.5">
                              <span>
                                {u.kind === "convergence"
                                  ? "Meetup"
                                  : "Sidequest"}
                              </span>
                              <span className="tabular-nums text-foreground/80">
                                {u.secondary}
                              </span>
                            </div>
                            {u.destination && (
                              <div className="truncate text-[10px] text-muted-foreground/90">
                                →{" "}
                                {u.destination.artist ? (
                                  <span className="text-foreground/80">
                                    {u.destination.artist}
                                  </span>
                                ) : null}
                                {u.destination.artist ? " · " : ""}
                                <span>{u.destination.stage}</span>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <ArrowRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {highlightId && !isFocused && (
          <button
            type="button"
            onClick={() => setHighlightId(null)}
            className="inline-flex h-7 w-fit items-center gap-1 self-end rounded-full border border-border/60 bg-background/40 px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="size-3" />
            Clear highlight
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function convergenceSecondary(m: Doc<"meetups">): string {
  // Times only — the destination artist + stage are surfaced on a
  // sub-line, so we keep this row short enough that the time isn't
  // truncated on narrow screens.
  if (m.meetMs !== undefined) {
    if (m.meetEndMs !== undefined && m.meetEndMs > m.meetMs) {
      return `${formatTime(m.meetMs)} – ${formatTime(m.meetEndMs)}`;
    }
    return `gather ${formatTime(m.meetMs)}`;
  }
  return formatRange(m.windowStartMs, m.windowEndMs);
}

/**
 * Resolve which artist a convergence is heading to. The meetup row
 * only stores `destinationStage`; the artist is whichever set on
 * that stage overlaps with the convergence buffer window. We pick
 * the set with the largest overlap to be safe against
 * back-to-back sets sharing a window edge.
 */
function resolveDestinationArtist(
  m: Doc<"meetups">,
  artists: Doc<"artists">[],
): Doc<"artists"> | null {
  let best: { artist: Doc<"artists">; overlap: number } | null = null;
  const stage = m.destinationStage;
  for (const a of artists) {
    if (a.day !== m.day) continue;
    if (a.stage !== stage) continue;
    const overlap =
      Math.min(a.endMs, m.windowEndMs) - Math.max(a.startMs, m.windowStartMs);
    if (overlap <= 0) continue;
    if (!best || overlap > best.overlap) {
      best = { artist: a, overlap };
    }
  }
  return best?.artist ?? null;
}
