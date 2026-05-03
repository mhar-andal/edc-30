import { ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberChip } from "@/components/MemberChip";
import { MeetupBadges } from "./MeetupBadges";
import { getStagePalette } from "@/lib/colors";
import { formatTime } from "@/lib/time";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { Artist } from "@/lib/useScheduleData";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetup: Doc<"meetups">;
  membersById: Map<string, Doc<"members">>;
  /**
   * Optional artist context: where each member was coming from and the shared
   * "next" artist. When provided, the dialog renders the rich convergence
   * details — otherwise it falls back to a simple summary.
   */
  fromArtistA?: Artist | null;
  fromArtistB?: Artist | null;
  toArtist?: Artist | null;
}

export function MeetupDetailDialog({
  open,
  onOpenChange,
  meetup,
  membersById,
  fromArtistA,
  fromArtistB,
  toArtist,
}: Props) {
  const memberA = membersById.get(meetup.memberAId);
  const memberB = membersById.get(meetup.memberBId);
  const editor = membersById.get(meetup.editedByMemberId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Meetup details</DialogTitle>
          <DialogDescription>
            Convergence window {formatTime(meetup.windowStartMs)}–
            {formatTime(meetup.windowEndMs)}
          </DialogDescription>
        </DialogHeader>

        <MeetupBadges
          label={meetup.label}
          fallbackStartMs={meetup.windowStartMs}
          fallbackEndMs={meetup.windowEndMs}
          meetupStartMs={meetup.meetupStartMs}
          meetupEndMs={meetup.meetupEndMs}
        />

        {toArtist && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-300">
              Heading to
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <DestinationBadge artist={toArtist} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Coming from
          </div>
          {memberA && (
            <PartyRow
              member={memberA}
              fromArtist={fromArtistA ?? null}
            />
          )}
          {memberB && (
            <PartyRow
              member={memberB}
              fromArtist={fromArtistB ?? null}
            />
          )}
        </div>

        <div className="text-[11px] text-muted-foreground">
          set by {editor?.name ?? "—"} at {formatTime(meetup.editedAt)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DestinationBadge({ artist }: { artist: Artist }) {
  const palette = getStagePalette(artist.stage);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold"
      style={{
        backgroundColor: `rgb(${palette.rgb} / 0.18)`,
        color: `rgb(${palette.rgb})`,
        boxShadow: `inset 0 0 0 1px rgb(${palette.rgb} / 0.5)`,
      }}
    >
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: `rgb(${palette.rgb})` }}
      />
      {artist.name}
      <span className="text-[10px] font-normal tabular-nums opacity-80">
        · {formatTime(artist.startMs)}
      </span>
    </span>
  );
}

function PartyRow({
  member,
  fromArtist,
}: {
  member: Doc<"members">;
  fromArtist: Artist | null;
}) {
  const palette = fromArtist ? getStagePalette(fromArtist.stage) : null;
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <MemberChip
          name={member.name}
          color={member.color}
          size="sm"
          truncate
        />
        <ArrowRight className="size-3 text-muted-foreground" />
        {fromArtist && palette ? (
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
            style={{
              backgroundColor: `rgb(${palette.rgb} / 0.18)`,
              color: `rgb(${palette.rgb})`,
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: `rgb(${palette.rgb})` }}
            />
            {fromArtist.name}
            <span className="text-[10px] font-normal text-muted-foreground">
              · {fromArtist.stage}
            </span>
          </span>
        ) : (
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-muted-foreground">
            (start of day)
          </span>
        )}
      </div>
      {fromArtist && (
        <div className="mt-1 pl-1 text-[10px] tabular-nums text-muted-foreground">
          ends {formatTime(fromArtist.endMs)}
        </div>
      )}
    </div>
  );
}

