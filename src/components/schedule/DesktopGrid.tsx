import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ArtistCard } from "./ArtistCard";
import { SidequestBlock } from "@/components/sidequests/SidequestBlock";
import {
  SidequestDialog,
  snap15,
  type SidequestDraft,
} from "@/components/sidequests/SidequestDialog";
import { STAGE_NAMES, getStagePalette } from "@/lib/colors";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  FESTIVAL_DAY_RANGE_MS,
  FESTIVAL_DAY_HOURS,
  clampMs,
  formatHour,
  formatTime,
  type DayKey,
} from "@/lib/time";
import type { Artist, Member, Sidequest } from "@/lib/useScheduleData";
import { cn } from "@/lib/utils";

interface Props {
  day: DayKey;
  artists: Artist[];
  selectionsByArtist: Map<string, Array<Id<"members">>>;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  myOverlapsByArtist: Map<string, Artist[]>;
  sidequests: Sidequest[];
}

const PIXELS_PER_HOUR = 80;
const SIDEQUEST_COLUMN_PX = 200;
const TIME_COLUMN_PX = 64;
const MIN_SIDEQUEST_MINUTES = 15;
const DEFAULT_SIDEQUEST_DURATION_MS = 60 * 60 * 1000;

interface DragState {
  /** Pointer's startY in container-relative pixels at the time of pointerdown. */
  startY: number;
  /** Latest pointer Y (container-relative) — drives the live ghost. */
  currentY: number;
  /** True once movement has crossed the activation threshold. */
  active: boolean;
  pointerId: number;
}

interface EditState {
  open: boolean;
  mode:
    | { kind: "create"; defaults: SidequestDraft }
    | { kind: "edit"; sidequestId: Id<"sidequests">; defaults: SidequestDraft };
}

export function DesktopGrid({
  day,
  artists,
  selectionsByArtist,
  membersById,
  myMemberId,
  myOverlapsByArtist,
  sidequests,
}: Props) {
  const range = FESTIVAL_DAY_RANGE_MS[day];
  const totalHeight = FESTIVAL_DAY_HOURS * PIXELS_PER_HOUR;

  const visibleStages = STAGE_NAMES;

  const hourMarkers = useMemo(() => {
    const markers: Array<{ ms: number; label: string; topPx: number }> = [];
    const slots = Math.ceil(FESTIVAL_DAY_HOURS) + 1;
    for (let i = 0; i < slots; i++) {
      const ms = range.start + i * 60 * 60 * 1000;
      markers.push({
        ms,
        label: formatHour(ms),
        topPx: i * PIXELS_PER_HOUR,
      });
    }
    return markers;
  }, [range.start]);

  // ----- drag-to-create state -----
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);

  function pxToMs(px: number): number {
    const clampedPx = Math.max(0, Math.min(totalHeight, px));
    const ratio = clampedPx / totalHeight;
    return range.start + ratio * (range.end - range.start);
  }

  function msToPx(ms: number): number {
    return ((ms - range.start) / (range.end - range.start)) * totalHeight;
  }

  function localY(clientY: number): number {
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clientY - rect.top;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Only react to primary mouse button (or pen/touch). Ignore right-click,
    // middle-click, and any synthesized events that bubbled from a card.
    if (e.button !== 0) return;
    if (!myMemberId) return;
    // Don't start a drag from a click that originated inside an interactive
    // descendant (artist card buttons, sidequest blocks, etc.).
    const target = e.target as HTMLElement | null;
    if (target?.closest("[data-noselect]")) return;

    const y = localY(e.clientY);
    setDrag({ startY: y, currentY: y, active: false, pointerId: e.pointerId });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const y = localY(e.clientY);
    const moved = Math.abs(y - drag.startY) > 4;
    if (!drag.active && moved) {
      // Capture the pointer once we've activated so the user can drag
      // off the grid without losing the gesture.
      try {
        bodyRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    setDrag({ ...drag, currentY: y, active: drag.active || moved });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      bodyRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    if (drag.active && myMemberId) {
      const yA = drag.startY;
      const yB = drag.currentY;
      const top = Math.min(yA, yB);
      const bottom = Math.max(yA, yB);
      const rawStartMs = pxToMs(top);
      const rawEndMs = pxToMs(bottom);
      let startMs = clampMs(snap15(rawStartMs), range.start, range.end - 60_000);
      let endMs = clampMs(snap15(rawEndMs), range.start + 60_000, range.end);
      const minMs = MIN_SIDEQUEST_MINUTES * 60_000;
      if (endMs - startMs < minMs) {
        endMs = clampMs(startMs + minMs, range.start + 60_000, range.end);
        if (endMs - startMs < minMs) {
          startMs = clampMs(endMs - minMs, range.start, range.end - 60_000);
        }
      }
      openCreate({ startMs, endMs });
    }
    setDrag(null);
  }

  function onPointerCancel() {
    setDrag(null);
  }

  function openCreate(initial?: { startMs: number; endMs: number }) {
    let startMs = initial?.startMs ?? Math.floor(range.start + (range.end - range.start) * 0.5);
    let endMs = initial?.endMs ?? startMs + DEFAULT_SIDEQUEST_DURATION_MS;
    startMs = clampMs(snap15(startMs), range.start, range.end - 60_000);
    endMs = clampMs(snap15(endMs), startMs + 60_000, range.end);

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

  function openEdit(sq: Sidequest) {
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

  // ----- ghost block visualization -----
  const ghost = useMemo(() => {
    if (!drag || !drag.active) return null;
    const top = Math.min(drag.startY, drag.currentY);
    const bottom = Math.max(drag.startY, drag.currentY);
    const rawStartMs = pxToMs(top);
    const rawEndMs = pxToMs(bottom);
    const startMs = clampMs(snap15(rawStartMs), range.start, range.end - 60_000);
    const endMs = clampMs(snap15(rawEndMs), range.start + 60_000, range.end);
    return {
      topPx: msToPx(startMs),
      heightPx: Math.max(20, msToPx(endMs) - msToPx(startMs)),
      startMs,
      endMs,
    };
  }, [drag, range.start, range.end, totalHeight]);

  return (
    <>
      <div className="rounded-lg border border-border/60 bg-card/40">
        <div className="overflow-x-auto">
          <div
            className="relative"
            style={{
              minWidth:
                TIME_COLUMN_PX +
                SIDEQUEST_COLUMN_PX +
                visibleStages.length * 200,
            }}
          >
            <div
              className="sticky top-0 z-20 grid items-stretch border-b border-border/60 bg-card/95 backdrop-blur"
              style={{
                gridTemplateColumns: `${TIME_COLUMN_PX}px ${SIDEQUEST_COLUMN_PX}px repeat(${visibleStages.length}, minmax(180px, 1fr))`,
              }}
            >
              <div className="border-r border-border/60 px-2 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                Time
              </div>
              <div
                className="flex items-center justify-between gap-1 border-r border-border/60 px-2 py-2 text-xs font-semibold text-violet-300"
                data-noselect
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-violet-400" />
                  Sidequests
                </span>
                <button
                  type="button"
                  onClick={() => openCreate()}
                  disabled={!myMemberId}
                  title={
                    myMemberId
                      ? "Create a sidequest"
                      : "Sign in to create a sidequest"
                  }
                  className="inline-flex size-5 items-center justify-center rounded-full text-violet-300 transition-colors hover:bg-violet-500/20 disabled:opacity-40"
                  aria-label="Create a sidequest"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              {visibleStages.map((stage) => {
                const palette = getStagePalette(stage);
                return (
                  <div
                    key={stage}
                    className="border-r border-border/60 px-2 py-2 text-xs font-semibold last:border-r-0"
                    style={{ color: `rgb(${palette.rgb})` }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: `rgb(${palette.rgb})` }}
                      />
                      {stage}
                    </span>
                  </div>
                );
              })}
            </div>

            <div
              ref={bodyRef}
              className={cn(
                "relative grid select-none",
                drag?.active && "cursor-row-resize",
              )}
              style={{
                gridTemplateColumns: `${TIME_COLUMN_PX}px ${SIDEQUEST_COLUMN_PX}px repeat(${visibleStages.length}, minmax(180px, 1fr))`,
                height: totalHeight,
                touchAction: "pan-x",
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            >
              <div className="relative border-r border-border/60">
                {hourMarkers.map((m) => (
                  <div
                    key={m.ms}
                    className="absolute -translate-y-1/2 px-2 text-[10px] tabular-nums text-muted-foreground"
                    style={{ top: m.topPx }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>

              <div className="relative border-r border-border/60">
                {hourMarkers.slice(1).map((m) => (
                  <div
                    key={m.ms}
                    className="absolute left-0 right-0 border-t border-dashed border-border/30"
                    style={{ top: m.topPx }}
                  />
                ))}
                {sidequests.length === 0 && !drag?.active && (
                  <div className="pointer-events-none absolute inset-x-2 top-3 rounded border border-dashed border-violet-500/30 px-2 py-2 text-[10px] leading-snug text-violet-300/70">
                    Drag here (or anywhere on the grid) to plan a sidequest
                    {myMemberId
                      ? ""
                      : " — sign in first."}
                  </div>
                )}
                {sidequests.map((sq) => {
                  const startOffset = Math.max(0, msToPx(sq.startMs));
                  const heightPx = Math.max(
                    36,
                    msToPx(sq.endMs) - msToPx(sq.startMs),
                  );
                  return (
                    <div
                      key={sq._id}
                      className="absolute left-1 right-1"
                      style={{ top: startOffset, height: heightPx }}
                      data-noselect
                    >
                      <SidequestBlock
                        sidequest={sq}
                        membersById={membersById}
                        myMemberId={myMemberId}
                        onEdit={openEdit}
                        className="h-full"
                      />
                    </div>
                  );
                })}

                {ghost && (
                  <div
                    className="pointer-events-none absolute left-1 right-1 rounded-md border border-violet-400/70 bg-violet-500/20 px-2 py-1 text-[10px] font-medium text-violet-100 shadow-sm"
                    style={{ top: ghost.topPx, height: ghost.heightPx }}
                  >
                    <div className="tabular-nums">
                      {formatTime(ghost.startMs)} – {formatTime(ghost.endMs)}
                    </div>
                  </div>
                )}
              </div>

              {visibleStages.map((stage) => (
                <div
                  key={stage}
                  className="relative border-r border-border/60 last:border-r-0"
                >
                  {hourMarkers.slice(1).map((m) => (
                    <div
                      key={m.ms}
                      className="absolute left-0 right-0 border-t border-dashed border-border/30"
                      style={{ top: m.topPx }}
                    />
                  ))}

                  {artists
                    .filter((a) => a.stage === stage)
                    .map((a) => {
                      const startOffset = Math.max(
                        0,
                        ((a.startMs - range.start) / 3600000) * PIXELS_PER_HOUR,
                      );
                      const heightPx = Math.max(
                        28,
                        ((a.endMs - a.startMs) / 3600000) * PIXELS_PER_HOUR,
                      );
                      const picked = selectionsByArtist.get(a._id) ?? [];
                      return (
                        <div
                          key={a._id}
                          className="absolute left-1 right-1"
                          style={{ top: startOffset, height: heightPx }}
                          data-noselect
                        >
                          <ArtistCard
                            artist={a}
                            pickedByMemberIds={picked}
                            membersById={membersById}
                            myMemberId={myMemberId}
                            myOverlapping={myOverlapsByArtist.get(a._id)}
                            density="compact"
                            showTime={false}
                            className="h-full"
                          />
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

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
    </>
  );
}
