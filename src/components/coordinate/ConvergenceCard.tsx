import { ArrowRight } from "lucide-react";
import { MemberChip } from "@/components/MemberChip";
import { MeetupEditor } from "./MeetupEditor";
import { MeetupBadges } from "./MeetupBadges";
import { formatRange, formatTime, type DayKey } from "@/lib/time";
import { getStagePalette } from "@/lib/colors";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import type { Convergence } from "@/lib/coordinate";

interface Props {
  day: DayKey;
  conv: Convergence;
  membersById: Map<string, Doc<"members">>;
  meetupsByKey: Map<string, Doc<"meetups">>;
  myMemberId: Id<"members"> | null;
  meetupKey: string;
}

export function ConvergenceCard({
  day,
  conv,
  membersById,
  meetupsByKey,
  myMemberId,
  meetupKey,
}: Props) {
  const memberA = membersById.get(conv.memberAId);
  const memberB = membersById.get(conv.memberBId);
  if (!memberA || !memberB) return null;
  const existing = meetupsByKey.get(meetupKey);
  // Both buffers are guaranteed to share the same toArtist by the convergence rule.
  const toArtist = conv.bufferA.toArtist ?? conv.bufferB.toArtist;
  const toPalette = toArtist ? getStagePalette(toArtist.stage) : null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold tabular-nums">
          {formatRange(conv.windowStart, conv.windowEnd)}
        </div>
      </div>
      {toArtist && toPalette && (
        <div
          className="mt-2 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm"
          style={{
            backgroundColor: `rgb(${toPalette.rgb} / 0.12)`,
            color: `rgb(${toPalette.rgb})`,
            boxShadow: `inset 0 0 0 1px rgb(${toPalette.rgb} / 0.4)`,
          }}
        >
          <span className="text-[11px] uppercase tracking-wide opacity-80">
            Heading to
          </span>
          <span className="font-semibold">{toArtist.name}</span>
          <span className="opacity-80">· {toArtist.stage}</span>
          <span className="ml-auto text-[11px] font-normal tabular-nums opacity-70">
            {formatTime(toArtist.startMs)}
          </span>
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <MemberRow
          member={memberA}
          buffer={conv.bufferA}
          myMemberId={myMemberId}
        />
        <MemberRow
          member={memberB}
          buffer={conv.bufferB}
          myMemberId={myMemberId}
        />
      </div>
      {existing && existing.label && (
        <MeetupBadges
          className="mt-3"
          label={existing.label}
          fallbackStartMs={conv.windowStart}
          fallbackEndMs={conv.windowEnd}
          meetupStartMs={existing.meetupStartMs}
          meetupEndMs={existing.meetupEndMs}
        />
      )}
      <div className="mt-3">
        <MeetupEditor
          day={day}
          windowStart={conv.windowStart}
          windowEnd={conv.windowEnd}
          memberAId={conv.memberAId}
          memberBId={conv.memberBId}
          existing={existing}
          myMemberId={myMemberId}
          membersById={membersById}
        />
      </div>
    </div>
  );
}

function MemberRow({
  member,
  buffer,
  myMemberId,
}: {
  member: Doc<"members">;
  buffer: Convergence["bufferA"];
  myMemberId: Id<"members"> | null;
}) {
  const fromPalette = buffer.fromArtist
    ? getStagePalette(buffer.fromArtist.stage)
    : null;
  const toPalette = buffer.toArtist
    ? getStagePalette(buffer.toArtist.stage)
    : null;
  const isMine = member._id === myMemberId;
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-3">
      <div className="mb-2">
        <MemberChip
          name={member.name}
          color={member.color}
          size="sm"
          isYou={isMine}
          truncate
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {buffer.fromArtist ? (
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
            style={{
              backgroundColor: `rgb(${fromPalette!.rgb} / 0.2)`,
              color: `rgb(${fromPalette!.rgb})`,
            }}
            title={buffer.fromArtist.stage}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: `rgb(${fromPalette!.rgb})` }}
            />
            {buffer.fromArtist.name}
          </span>
        ) : (
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-muted-foreground">
            (start of day)
          </span>
        )}
        <ArrowRight className="size-3 text-muted-foreground" />
        {buffer.toArtist ? (
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
            style={{
              backgroundColor: `rgb(${toPalette!.rgb} / 0.2)`,
              color: `rgb(${toPalette!.rgb})`,
            }}
            title={buffer.toArtist.stage}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: `rgb(${toPalette!.rgb})` }}
            />
            {buffer.toArtist.name}
          </span>
        ) : (
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-muted-foreground">
            (end of day)
          </span>
        )}
      </div>
    </div>
  );
}
