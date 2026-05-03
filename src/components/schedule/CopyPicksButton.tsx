import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { ArrowRight, Check, Copy, Loader2 } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { MemberDot } from "@/components/MemberDot";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsOffline } from "@/lib/useIsOffline";
import { cn } from "@/lib/utils";

type Mode = "add" | "replace";

interface Props {
  members: Doc<"members">[];
  myMemberId: Id<"members">;
  myMemberName: string;
  myMemberColor: string;
  picksByMember: Map<string, number>;
}

export function CopyPicksButton({
  members,
  myMemberId,
  myMemberName,
  myMemberColor,
  picksByMember,
}: Props) {
  const copyFromMember = useMutation(api.memberSelections.copyFromMember);
  const offline = useIsOffline();
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState<Id<"members"> | null>(null);
  const [mode, setMode] = useState<Mode>("add");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    added: number;
    skipped: number;
    removed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(
    () => members.filter((m) => m._id !== myMemberId),
    [members, myMemberId],
  );

  useEffect(() => {
    if (!open) {
      setSourceId(null);
      setMode("add");
      setResult(null);
      setError(null);
    }
  }, [open]);

  const source = sourceId ? members.find((m) => m._id === sourceId) : null;

  async function handleCopy() {
    if (!source || offline) return;
    setBusy(true);
    setError(null);
    try {
      const r = await copyFromMember({
        sourceMemberId: source._id,
        targetMemberId: myMemberId,
        mode,
      });
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={offline}
          title={
            offline ? "Offline — reconnect to copy picks" : undefined
          }
        >
          <Copy className="size-4" />
          Copy picks
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Copy picks from a member</DialogTitle>
          <DialogDescription>
            Bring another member&apos;s picks onto yours as a starting point.
            Tweak from there.
          </DialogDescription>
        </DialogHeader>

        {!source && (
          <div className="space-y-2">
            <Label className="block text-xs uppercase tracking-wide text-muted-foreground">
              Pick someone to copy from
            </Label>
            <ScrollArea className="h-72 rounded-md border border-border/60">
              <div className="grid gap-1 p-1.5">
                {candidates.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                    No other members yet.
                  </div>
                ) : (
                  candidates.map((m) => (
                    <button
                      key={m._id}
                      type="button"
                      onClick={() => setSourceId(m._id)}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-md p-2 text-left transition-colors hover:bg-secondary/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <MemberDot color={m.color} size="md" />
                        <span className="text-sm font-medium">{m.name}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {picksByMember.get(m._id) ?? 0} picks
                      </span>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </div>
        )}

        {source && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-md border border-border/60 bg-background/40 p-3 text-sm">
              <MemberDot color={source.color} size="md" />
              <span className="font-medium">{source.name}</span>
              <ArrowRight className="size-4 text-muted-foreground" />
              <MemberDot color={myMemberColor} size="md" />
              <span className="font-medium">{myMemberName}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {picksByMember.get(source._id) ?? 0} picks
              </span>
            </div>
            <div className="space-y-2">
              <Label className="block text-xs uppercase tracking-wide text-muted-foreground">
                How to apply
              </Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <label
                  htmlFor="m-add"
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-border/60 p-3 hover:bg-secondary/30"
                >
                  <RadioGroupItem id="m-add" value="add" />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">Add to my picks</div>
                    <div className="text-xs text-muted-foreground">
                      Keeps everything you've already picked. Duplicates skipped.
                    </div>
                  </div>
                </label>
                <label
                  htmlFor="m-replace"
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-border/60 p-3 hover:bg-secondary/30"
                >
                  <RadioGroupItem id="m-replace" value="replace" />
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">Replace my picks</div>
                    <div className="text-xs text-muted-foreground">
                      Clears your current picks first. Cannot be undone.
                    </div>
                  </div>
                </label>
              </RadioGroup>
            </div>
            {result && (
              <div className="flex items-center gap-2 rounded-md bg-emerald-500/15 px-3 py-2 text-sm text-emerald-200">
                <Check className="size-4" />
                Done — added {result.added}, skipped {result.skipped}
                {result.removed > 0 ? `, removed ${result.removed}` : ""}.
              </div>
            )}
            {error && (
              <div className="rounded-md bg-destructive/15 px-3 py-2 text-sm">
                {error}
              </div>
            )}
            <DialogFooter className="flex-row-reverse justify-start gap-2 sm:justify-end">
              {result ? (
                <Button onClick={() => setOpen(false)}>Close</Button>
              ) : (
                <Button
                  onClick={handleCopy}
                  disabled={busy || offline}
                  title={
                    offline ? "Offline — reconnect to copy picks" : undefined
                  }
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : mode === "replace" ? (
                    "Replace with their picks"
                  ) : (
                    "Add their picks"
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setSourceId(null);
                  setResult(null);
                  setError(null);
                }}
              >
                Back
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
