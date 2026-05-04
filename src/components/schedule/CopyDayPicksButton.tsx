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
  /** Source member's pick count for the day. 0 disables the button. */
  sourceDayPickCount: number;
  className?: string;
}

/**
 * Inline copy-picks action: clicking it directly copies the source
 * member's picks for the given day into the target member's picks
 * (mode "add" — duplicates are skipped). Shows result inline once
 * complete; no nested dialog.
 */
export function CopyDayPicksButton({
  sourceMemberId,
  sourceMemberName,
  targetMemberId,
  day,
  sourceDayPickCount,
  className,
}: Props) {
  const copy = useMutation(api.memberSelections.copyFromMember);
  const offline = useIsOffline();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { added: number; skipped: number; removed: number }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = offline || sourceDayPickCount === 0 || busy;

  async function handleCopy() {
    if (disabled) return;
    setBusy(true);
    setError(null);
    try {
      const r = await copy({
        sourceMemberId,
        targetMemberId,
        mode: "add",
        day,
      });
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <span
        className={
          "inline-flex h-7 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 text-[11px] font-medium text-emerald-200 ring-1 ring-emerald-500/30 " +
          (className ?? "")
        }
      >
        <Check className="size-3" />
        Added {result.added}
        {result.skipped > 0 ? ` · skipped ${result.skipped}` : ""}
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
          ? "Offline — reconnect to copy picks"
          : sourceDayPickCount === 0
            ? `${sourceMemberName} hasn't picked anything for this day`
            : `Copy ${sourceMemberName}'s picks for this day`
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
