import { useMutation } from "convex/react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { MemberChip } from "@/components/MemberChip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChooseNextDialog } from "./ChooseNextDialog";
import { getStagePalette } from "@/lib/colors";
import { formatTime } from "@/lib/time";
import { useAutoScroll } from "@/lib/useAutoScroll";
import { useIsOffline } from "@/lib/useIsOffline";
import type { Artist, Member } from "@/lib/useScheduleData";
import { cn } from "@/lib/utils";

interface Props {
  artist: Doc<"artists">;
  pickedByMemberIds: ReadonlyArray<Id<"members">>;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  /**
   * Other artists in the current member's picks that overlap with this one
   * on a different stage. Used to surface "you'll have to leave early" warnings.
   */
  myOverlapping?: ReadonlyArray<Artist>;
  /**
   * The full list of artists for the day this artist is on. Used by the
   * "Choose next" dialog when the user has picked this artist.
   */
  dayArtists?: Artist[];
  selectionsByArtist?: Map<string, Array<Id<"members">>>;
  density?: "compact" | "normal";
  showStageBadge?: boolean;
  showTime?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ArtistCard({
  artist,
  pickedByMemberIds,
  membersById,
  myMemberId,
  myOverlapping,
  dayArtists,
  selectionsByArtist,
  density = "normal",
  showStageBadge,
  showTime = true,
  onClick,
  className,
}: Props) {
  const palette = getStagePalette(artist.stage);
  const toggle = useMutation(api.memberSelections.toggle);
  const offline = useIsOffline();
  const [busy, setBusy] = useState(false);
  const [nextOpen, setNextOpen] = useState(false);
  const stageRgb = palette.rgb;

  const pickedSet = new Set(pickedByMemberIds);
  const youPicked = !!myMemberId && pickedSet.has(myMemberId);
  const canChooseNext =
    youPicked &&
    !!myMemberId &&
    !!dayArtists &&
    !!selectionsByArtist &&
    density === "normal";

  async function handleToggleSelf(e: React.MouseEvent | React.PointerEvent) {
    e.stopPropagation();
    if (!myMemberId || busy || offline) return;
    setBusy(true);
    try {
      await toggle({ memberId: myMemberId, artistId: artist._id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-md border text-left transition-all",
        density === "compact" ? "p-1.5" : "p-2",
        onClick && "cursor-pointer",
        className,
      )}
      style={{
        backgroundColor: `rgb(${stageRgb} / 0.18)`,
        borderColor: `rgb(${stageRgb} / 0.45)`,
      }}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate font-semibold leading-tight",
              density === "compact" ? "text-[11px]" : "text-xs sm:text-sm",
            )}
          >
            {artist.name}
          </div>
          {showStageBadge && (
            <div className="mt-0.5">
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `rgb(${stageRgb} / 0.3)`,
                  color: `rgb(${stageRgb})`,
                }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: `rgb(${stageRgb})` }}
                />
                {artist.stage}
              </span>
            </div>
          )}
          {showTime && (
            <div
              className={cn(
                "mt-0.5 tabular-nums text-muted-foreground",
                density === "compact" ? "text-[9px]" : "text-[10px]",
              )}
            >
              {formatTime(artist.startMs)} – {formatTime(artist.endMs)}
            </div>
          )}
        </div>
        {myMemberId && (
          <button
            type="button"
            onClick={handleToggleSelf}
            disabled={busy || offline}
            title={
              offline
                ? "Offline — reconnect to edit picks"
                : youPicked
                  ? "Remove from your picks"
                  : "Add to your picks"
            }
            className={cn(
              "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              youPicked
                ? "bg-primary/15 text-primary hover:bg-primary/25"
                : "border border-dashed border-foreground/30 text-muted-foreground hover:border-foreground/60 hover:text-foreground",
            )}
          >
            {busy ? (
              <Loader2 className="size-2.5 animate-spin" />
            ) : youPicked ? (
              <Check className="size-2.5" />
            ) : (
              <Plus className="size-2.5" />
            )}
            <span>{youPicked ? "Picked" : "Add"}</span>
          </button>
        )}
      </div>
      {density === "normal" &&
        myOverlapping &&
        myOverlapping.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="mt-1 inline-flex w-fit items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200 ring-1 ring-amber-500/40 transition-colors hover:bg-amber-500/25"
                title="Conflicts with your picks"
              >
                <AlertTriangle className="size-2.5 shrink-0" />
                <span className="truncate">
                  Overlaps with {myOverlapping[0].name}
                  {myOverlapping.length > 1
                    ? ` +${myOverlapping.length - 1}`
                    : ""}
                </span>
              </button>
            </PopoverTrigger>
            <OverlapPopoverContent items={myOverlapping} />
          </Popover>
        )}
      <div className="mt-1 flex min-w-0 items-center">
        {pickedByMemberIds.length === 0 ? (
          <span className="text-[10px] text-muted-foreground/70">
            {myMemberId ? "Be the first" : "No picks yet"}
          </span>
        ) : (
          <AttendeesStrip
            pickedByMemberIds={pickedByMemberIds}
            membersById={membersById}
            myMemberId={myMemberId}
          />
        )}
      </div>
      {canChooseNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setNextOpen(true);
          }}
          className="mt-2 inline-flex h-6 w-fit items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          Choose next set
          <ArrowRight className="size-3" />
        </button>
      )}
      {canChooseNext && nextOpen && (
        <ChooseNextDialog
          open={nextOpen}
          onOpenChange={setNextOpen}
          fromArtist={artist}
          allDayArtists={dayArtists!}
          selectionsByArtist={selectionsByArtist!}
          membersById={membersById}
          myMemberId={myMemberId!}
        />
      )}
      {density === "compact" && myOverlapping && myOverlapping.length > 0 && (
        <div className="pointer-events-none absolute right-1 top-1 flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                title={`Overlaps with ${myOverlapping.length} of your picks`}
                aria-label={`Overlaps with ${myOverlapping.length} of your picks`}
                className="pointer-events-auto inline-flex h-4 items-center gap-0.5 rounded-full bg-amber-500/25 px-1 text-[9px] font-semibold text-amber-200 ring-1 ring-amber-500/50 transition-colors hover:bg-amber-500/40"
              >
                <AlertTriangle className="size-2.5" />
                {myOverlapping.length > 1 ? myOverlapping.length : ""}
              </button>
            </PopoverTrigger>
            <OverlapPopoverContent items={myOverlapping} />
          </Popover>
        </div>
      )}
    </div>
  );
}

function OverlapPopoverContent({
  items,
}: {
  items: ReadonlyArray<Artist>;
}) {
  return (
    <PopoverContent
      className="w-64 px-3 py-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-amber-200">
        <AlertTriangle className="size-3" />
        Overlaps with your picks
      </div>
      <ul className="space-y-1 text-xs">
        {items.map((o) => {
          const pal = getStagePalette(o.stage);
          return (
            <li key={o._id} className="flex items-center gap-1.5">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: `rgb(${pal.rgb})` }}
              />
              <span className="truncate font-medium">{o.name}</span>
              <span className="ml-auto whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
                {formatTime(o.startMs)}–{formatTime(o.endMs)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-muted-foreground">
        You can still pick this — handy if you want to leave one set early.
      </p>
    </PopoverContent>
  );
}

function AttendeesStrip({
  pickedByMemberIds,
  membersById,
  myMemberId,
}: {
  pickedByMemberIds: ReadonlyArray<Id<"members">>;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
}) {
  const ref = useAutoScroll<HTMLDivElement>({ endBehavior: "loop" });
  const chips = pickedByMemberIds
    .map((mid) => {
      const m = membersById.get(mid);
      if (!m) return null;
      return { mid, member: m, isYou: mid === myMemberId };
    })
    .filter((x): x is { mid: Id<"members">; member: Member; isYou: boolean } => x !== null);

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="-mx-0.5 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {chips.map(({ mid, member, isYou }) => (
        <MemberChip
          key={mid}
          name={member.name}
          color={member.color}
          size="xs"
          isYou={isYou}
          className="shrink-0"
        />
      ))}
      <div
        aria-hidden
        className="contents"
      >
        {chips.map(({ mid, member, isYou }) => (
          <MemberChip
            key={`dup-${mid}`}
            name={member.name}
            color={member.color}
            size="xs"
            isYou={isYou}
            className="shrink-0"
          />
        ))}
      </div>
    </div>
  );
}
