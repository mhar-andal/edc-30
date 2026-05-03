import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { ArrowRight, Check, Loader2, Play, Plus } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
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
import { STAGE_NAMES, getStagePalette } from "@/lib/colors";
import { formatTime } from "@/lib/time";
import { useIsOffline } from "@/lib/useIsOffline";
import type { Artist, Member } from "@/lib/useScheduleData";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The artist whose end time we're picking what's "next" after. */
  fromArtist: Artist;
  allDayArtists: Artist[];
  selectionsByArtist: Map<string, Array<Id<"members">>>;
  membersById: Map<string, Member>;
  myMemberId: Id<"members">;
}

const TOLERANCE_MS = 15 * 60 * 1000;

export function ChooseNextDialog({
  open,
  onOpenChange,
  fromArtist,
  allDayArtists,
  selectionsByArtist,
  membersById,
  myMemberId,
}: Props) {
  const toggle = useMutation(api.memberSelections.toggle);
  const offline = useIsOffline();
  const [busyArtistId, setBusyArtistId] = useState<Id<"artists"> | null>(null);

  const nextByStage = useMemo(() => {
    const map = new Map<string, Artist | null>();
    const usefulMinEnd = fromArtist.endMs - TOLERANCE_MS;
    for (const stage of STAGE_NAMES) {
      const candidates = allDayArtists
        .filter(
          (a) =>
            a._id !== fromArtist._id &&
            a.stage === stage &&
            a.startMs > fromArtist.startMs &&
            a.endMs > usefulMinEnd,
        )
        .sort((a, b) => a.startMs - b.startMs);
      map.set(stage, candidates[0] ?? null);
    }
    return map;
  }, [allDayArtists, fromArtist]);

  async function handleToggle(artistId: Id<"artists">) {
    if (offline) return;
    setBusyArtistId(artistId);
    try {
      await toggle({ memberId: myMemberId, artistId });
    } finally {
      setBusyArtistId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>What's next after {fromArtist.name}?</DialogTitle>
          <DialogDescription>
            Ends {formatTime(fromArtist.endMs)} on {fromArtist.stage}. Here's
            the next set on each stage.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-2 max-h-[60vh] space-y-1.5 overflow-y-auto px-2 pb-1">
          {STAGE_NAMES.map((stage) => {
            const palette = getStagePalette(stage);
            const next = nextByStage.get(stage);
            return (
              <div
                key={stage}
                className="overflow-hidden rounded-md border"
                style={{
                  borderColor: `rgb(${palette.rgb} / 0.45)`,
                  backgroundColor: `rgb(${palette.rgb} / 0.08)`,
                }}
              >
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold"
                  style={{ color: `rgb(${palette.rgb})` }}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: `rgb(${palette.rgb})` }}
                  />
                  {stage}
                </div>
                {next ? (
                  <NextRow
                    artist={next}
                    pickedByMemberIds={selectionsByArtist.get(next._id) ?? []}
                    membersById={membersById}
                    myMemberId={myMemberId}
                    busy={busyArtistId === next._id}
                    offline={offline}
                    onToggle={() => handleToggle(next._id)}
                    fromArtistEndMs={fromArtist.endMs}
                  />
                ) : (
                  <div className="px-2.5 pb-2 text-[11px] text-muted-foreground">
                    Nothing more on this stage today.
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NextRow({
  artist,
  pickedByMemberIds,
  membersById,
  myMemberId,
  busy,
  offline,
  onToggle,
  fromArtistEndMs,
}: {
  artist: Artist;
  pickedByMemberIds: ReadonlyArray<Id<"members">>;
  membersById: Map<string, Doc<"members">>;
  myMemberId: Id<"members">;
  busy: boolean;
  offline: boolean;
  onToggle: () => void;
  fromArtistEndMs: number;
}) {
  const youPicked = pickedByMemberIds.includes(myMemberId);
  const isOverlapping = artist.startMs < fromArtistEndMs;
  const remainingAfterMs = artist.endMs - fromArtistEndMs;
  const remainingMinutes = Math.max(0, Math.round(remainingAfterMs / 60000));
  return (
    <div className="px-2.5 pb-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{artist.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
            <ArrowRight className="size-3 text-muted-foreground" />
            {formatTime(artist.startMs)} – {formatTime(artist.endMs)}
            {isOverlapping && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-500/40"
                title="Started before your current set ends"
              >
                <Play className="size-2 fill-current" />
                Already started · {remainingMinutes} min left
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={busy || offline}
          title={
            offline
              ? "Offline — reconnect to edit picks"
              : youPicked
                ? "Remove from your picks"
                : "Add to your picks"
          }
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            youPicked
              ? "bg-primary/15 text-primary hover:bg-primary/25"
              : "border border-dashed border-foreground/30 text-muted-foreground hover:border-foreground/60 hover:text-foreground",
          )}
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : youPicked ? (
            <Check className="size-3" />
          ) : (
            <Plus className="size-3" />
          )}
          <span>{youPicked ? "Picked" : "Add"}</span>
        </button>
      </div>
      {pickedByMemberIds.length > 0 && (
        <div className="mt-1 flex items-center gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {pickedByMemberIds.map((mid) => {
            const m = membersById.get(mid);
            if (!m) return null;
            return (
              <MemberChip
                key={mid}
                name={m.name}
                color={m.color}
                size="xs"
                isYou={mid === myMemberId}
                truncate
                className="shrink-0"
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
