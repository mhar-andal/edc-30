import { useState } from "react";
import { useMutation } from "convex/react";
import {
  Calendar,
  Check,
  Edit2,
  Loader2,
  MapPin,
  StickyNote,
  Trash2,
  UserPlus,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MemberChip } from "@/components/MemberChip";
import { CommentsSection } from "@/components/comments/CommentsSection";
import { useIsOffline } from "@/lib/useIsOffline";
import { DAY_LABELS, formatRange } from "@/lib/time";
import type { Member, Sidequest } from "@/lib/useScheduleData";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface Props {
  sidequest: Sidequest;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  /** Called when the user clicks Edit; parent should open the edit dialog. */
  onEdit?: (sidequest: Sidequest) => void;
}

export function SidequestPopover({
  sidequest,
  membersById,
  myMemberId,
  onEdit,
}: Props) {
  const join = useMutation(api.sidequests.join);
  const leave = useMutation(api.sidequests.leave);
  const remove = useMutation(api.sidequests.remove);
  const offline = useIsOffline();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const creator = membersById.get(sidequest.createdByMemberId);
  const isCreator = !!myMemberId && myMemberId === sidequest.createdByMemberId;
  const iJoined = !!myMemberId && sidequest.participantMemberIds.some(
    (id) => id === myMemberId,
  );

  const participants: Member[] = [];
  for (const id of sidequest.participantMemberIds) {
    const m = membersById.get(id);
    if (m) participants.push(m);
  }
  participants.sort((a, b) => {
    if (a._id === sidequest.createdByMemberId) return -1;
    if (b._id === sidequest.createdByMemberId) return 1;
    return a.name.localeCompare(b.name);
  });

  async function toggleJoin() {
    if (!myMemberId || offline) return;
    setBusy(true);
    setError(null);
    try {
      if (iJoined) {
        await leave({ sidequestId: sidequest._id, memberId: myMemberId });
      } else {
        await join({ sidequestId: sidequest._id, memberId: myMemberId });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!myMemberId || offline) return;
    if (
      !confirm(
        "Delete this sidequest? Anyone who joined will be removed too.",
      )
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      await remove({ sidequestId: sidequest._id, memberId: myMemberId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold leading-tight">
          {sidequest.title}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" />
            {DAY_LABELS[sidequest.day].full}
          </span>
          <span className="tabular-nums">
            · {formatRange(sidequest.startMs, sidequest.endMs)}
          </span>
        </div>
      </div>

      {sidequest.location && (
        <div className="flex items-start gap-1.5 text-xs">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />
          <span>{sidequest.location}</span>
        </div>
      )}

      {sidequest.notes && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <StickyNote className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap break-words">
            {sidequest.notes}
          </span>
        </div>
      )}

      <Separator />

      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {participants.length === 0
            ? "No one in yet"
            : `${participants.length} in${creator ? ` · proposed by ${creator.name}` : ""}`}
        </div>
        {participants.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {participants.map((m) => (
              <MemberChip
                key={m._id}
                name={m.name}
                color={m.color}
                size="xs"
                truncate
                isYou={m._id === myMemberId}
              />
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {offline && (
        <p className="text-xs text-amber-300">
          Offline — reconnect to join, edit, or leave.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!isCreator && myMemberId && (
          <Button
            size="sm"
            variant={iJoined ? "outline" : "default"}
            onClick={toggleJoin}
            disabled={offline || busy}
            className="flex-1 min-w-32"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : iJoined ? (
              <UserX className="size-3.5" />
            ) : (
              <UserPlus className="size-3.5" />
            )}
            {iJoined ? "Leave" : "I'm in"}
          </Button>
        )}
        {isCreator && (
          <span className="inline-flex flex-1 items-center gap-1.5 rounded-md bg-secondary/50 px-2 py-1 text-[11px] text-muted-foreground">
            <Check className="size-3" />
            You proposed this
          </span>
        )}
        {isCreator && onEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onEdit(sidequest)}
            disabled={offline || deleting}
          >
            <Edit2 className="size-3.5" />
            Edit
          </Button>
        )}
        {isCreator && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            disabled={offline || deleting || busy}
            className="text-destructive hover:text-destructive"
            title="Delete this sidequest"
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

      <Separator />

      <CommentsSection
        ownerType="sidequest"
        ownerId={sidequest._id}
        myMemberId={myMemberId}
        membersById={membersById}
      />
    </div>
  );
}
