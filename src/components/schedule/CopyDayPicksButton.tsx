import { useState } from "react";
import { useMutation } from "convex/react";
import { Check, Copy, Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useIsOffline } from "@/lib/useIsOffline";
import type { DayKey } from "@/lib/time";

interface Props {
  sourceMemberId: Id<"members">;
  sourceMemberName: string;
  targetMemberId: Id<"members">;
  day: DayKey;
  /** Source member's pick count for the day. */
  sourceDayPickCount: number;
  /** Source member's sidequest-RSVP count for the day. */
  sourceDaySidequestCount: number;
  className?: string;
}

interface CopyResult {
  picksAdded: number;
  picksSkipped: number;
  rsvpsAdded: number;
  rsvpsSkipped: number;
}

/**
 * Inline copy action: copies the source member's artist picks AND
 * sidequest RSVPs for the given day onto the target member. Mode is
 * "add" — duplicates are skipped on both sides. Shows a compact
 * inline result chip when finished. Disabled when the source has
 * nothing to copy on this day.
 */
export function CopyDayPicksButton({
  sourceMemberId,
  sourceMemberName,
  targetMemberId,
  day,
  sourceDayPickCount,
  sourceDaySidequestCount,
  className,
}: Props) {
  const copyPicks = useMutation(api.memberSelections.copyFromMember);
  const copyRsvps = useMutation(api.sidequests.copyRsvpsFromMember);
  const offline = useIsOffline();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CopyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nothingToCopy =
    sourceDayPickCount === 0 && sourceDaySidequestCount === 0;
  const disabled = offline || nothingToCopy || busy;

  async function handleCopy() {
    if (disabled) return;
    setBusy(true);
    setError(null);
    try {
      // Run sequentially so we get crisp counts for each side; both run
      // against tiny tables so the latency is negligible.
      const picksResult =
        sourceDayPickCount > 0
          ? await copyPicks({
              sourceMemberId,
              targetMemberId,
              mode: "add",
              day,
            })
          : { added: 0, skipped: 0, removed: 0 };
      const rsvpsResult =
        sourceDaySidequestCount > 0
          ? await copyRsvps({ sourceMemberId, targetMemberId, day })
          : { joined: 0, skipped: 0 };
      setResult({
        picksAdded: picksResult.added,
        picksSkipped: picksResult.skipped,
        rsvpsAdded: rsvpsResult.joined,
        rsvpsSkipped: rsvpsResult.skipped,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const parts: string[] = [];
    if (result.picksAdded > 0)
      parts.push(`${result.picksAdded} pick${result.picksAdded === 1 ? "" : "s"}`);
    if (result.rsvpsAdded > 0)
      parts.push(
        `${result.rsvpsAdded} sidequest${result.rsvpsAdded === 1 ? "" : "s"}`,
      );
    const totalSkipped = result.picksSkipped + result.rsvpsSkipped;
    const summary =
      parts.length === 0
        ? "Nothing new to add"
        : `Added ${parts.join(" + ")}`;
    return (
      <span
        className={
          "inline-flex h-7 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 text-[11px] font-medium text-emerald-200 ring-1 ring-emerald-500/30 " +
          (className ?? "")
        }
      >
        <Check className="size-3" />
        {summary}
        {totalSkipped > 0 ? ` · skipped ${totalSkipped}` : ""}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleCopy}
      title={
        offline
          ? "Offline — reconnect to copy"
          : nothingToCopy
            ? `${sourceMemberName} has nothing for this day`
            : `Copy ${sourceMemberName}'s picks and sidequests for this day`
      }
      className={
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background/40 px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-40 " +
        (className ?? "")
      }
    >
      {busy ? (
        <Loader2 className="size-3 animate-spin" />
      ) : error ? (
        <span className="text-destructive">Retry</span>
      ) : (
        <>
          <Copy className="size-3" />
          Copy
        </>
      )}
    </button>
  );
}
