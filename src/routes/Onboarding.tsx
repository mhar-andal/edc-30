import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import {
  CloudOff,
  HelpCircle,
  Info,
  Loader2,
  Sparkles,
  Users,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/ColorPicker";
import { InstallPrompt } from "@/components/InstallPrompt";
import { MemberDot } from "@/components/MemberDot";
import {
  OnboardingTour,
  hasSeenTour,
  restartTour,
} from "@/components/onboarding/OnboardingTour";
import { MEMBER_PALETTE, nextAvailableColor } from "@/lib/colors";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { useIsOffline } from "@/lib/useIsOffline";
import { useMemberSession, writeStored } from "@/lib/useMemberSession";

export default function Onboarding() {
  const session = useMemberSession();
  const navigate = useNavigate();

  const members = useCachedQuery(api.members.list);
  const offline = useIsOffline();

  const [name, setName] = useState("");
  const [memberColor, setMemberColor] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  // Member captured from the "Already here" chip click flow. When
  // set, the sign-in confirmation dialog targets this member rather
  // than `memberByName` (which only exists when the user typed in a
  // name that matched). Lets the same dialog serve both flows.
  const [pendingSignInMember, setPendingSignInMember] = useState<{
    _id: Id<"members">;
    name: string;
    color: string;
  } | null>(null);

  useEffect(() => {
    if (session.status !== "anonymous") return;
    if (!hasSeenTour()) setTourOpen(true);
  }, [session.status]);

  const createMember = useMutation(api.members.create);

  const takenByMember = useMemo(
    () =>
      (members ?? []).map((m) => ({ color: m.color, name: m.name })),
    [members],
  );

  useEffect(() => {
    if (memberColor) return;
    if (members === undefined) return;
    setMemberColor(
      nextAvailableColor(
        MEMBER_PALETTE,
        takenByMember.map((t) => t.color),
      ),
    );
  }, [members, memberColor, takenByMember]);

  const trimmedName = name.trim();
  const trimmedNameLower = trimmedName.toLowerCase();
  const memberByName = useMemo(() => {
    if (!members || !trimmedNameLower) return undefined;
    return members.find((m) => m.nameLower === trimmedNameLower);
  }, [members, trimmedNameLower]);

  if (session.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (session.status === "authed") {
    return <Navigate to="/schedule" replace />;
  }

  const canSubmit =
    !submitting &&
    !offline &&
    !!trimmedName &&
    trimmedName.length <= 32 &&
    (!!memberByName || !!memberColor);

  // The dialog is shown for both flows — direct chip click and typed
  // name match. Pending click target wins when both are set so the
  // most recent intent is honored.
  const signInTarget = pendingSignInMember ?? memberByName ?? null;

  function signInAsExisting() {
    if (!signInTarget) return;
    writeStored({
      memberId: signInTarget._id,
      memberName: signInTarget.name,
      // Persist the color too so a swipe-up-then-cold-open offline
      // boot can render the header / chips without waiting on Convex.
      memberColor: signInTarget.color,
    });
    setSignInOpen(false);
    setPendingSignInMember(null);
    navigate("/schedule", { replace: true });
  }

  function startSignInFromChip(m: {
    _id: Id<"members">;
    name: string;
    color: string;
  }) {
    setPendingSignInMember({ _id: m._id, name: m.name, color: m.color });
    setSignInOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (memberByName) {
      setSignInOpen(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const memberId = await createMember({
        name: trimmedName,
        color: memberColor,
      });
      writeStored({
        memberId,
        memberName: trimmedName,
        memberColor,
      });
      navigate("/schedule", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      if (message.includes("NAME_TAKEN")) {
        setSignInOpen(true);
      } else if (message.includes("COLOR_TAKEN")) {
        setError("That color was just taken. Pick a different one.");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-primary/5">
      <div
        className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 sm:py-14"
        style={{
          paddingTop: "max(2rem, calc(env(safe-area-inset-top) + 1rem))",
          paddingBottom: "max(2rem, calc(env(safe-area-inset-bottom) + 1rem))",
        }}
      >
        <div className="space-y-2 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3" />
            EDC Las Vegas · May 15–17, 2026
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Coordinate your festival
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Pick your name to join, then start mapping out your weekend with
            friends.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => {
              restartTour();
              setTourOpen(true);
            }}
          >
            <HelpCircle className="size-3.5" />
            How does this work?
          </Button>
        </div>

        <InstallPrompt />

        {(members?.length ?? 0) > 0 && (
          <div className="rounded-xl border border-border/60 bg-card/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Users className="size-3.5" /> Already here ({members?.length})
            </div>
            <div className="mb-3 flex items-start gap-2 rounded-md bg-primary/10 px-2.5 py-1.5 text-[11px] text-primary ring-1 ring-primary/20">
              <Info className="mt-px size-3.5 shrink-0" />
              <span>
                Coming back? Tap your name below to sign in as that person.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(members ?? []).slice(0, 30).map((m) => (
                <button
                  key={m._id}
                  type="button"
                  onClick={() =>
                    startSignInFromChip({
                      _id: m._id,
                      name: m.name,
                      color: m.color,
                    })
                  }
                  title={`Sign in as ${m.name}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 transition-colors hover:bg-background hover:text-foreground hover:ring-1 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MemberDot color={m.color} />
                  <span className="text-[11px]">{m.name}</span>
                </button>
              ))}
              {(members ?? []).length > 30 && (
                <span className="text-[11px] text-muted-foreground">
                  +{(members ?? []).length - 30} more
                </span>
              )}
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-xl border border-border/60 bg-card/40 p-5 sm:p-6"
        >
          <div>
            <Label htmlFor="member-name" className="mb-1.5 inline-block">
              Your name
            </Label>
            <Input
              id="member-name"
              autoFocus
              placeholder="e.g. Mateo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              disabled={offline}
            />
            {memberByName && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                &ldquo;{memberByName.name}&rdquo; already exists — continue to
                sign in as them.
              </p>
            )}
          </div>
          {!memberByName && (
            <div>
              <Label className="mb-1.5 inline-block">Your color</Label>
              <ColorPicker
                value={memberColor}
                onChange={setMemberColor}
                palette={MEMBER_PALETTE}
                takenBy={takenByMember}
                disabled={offline}
                disabledReason="Offline — reconnect to join"
              />
            </div>
          )}

          {offline && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-200 ring-1 ring-amber-500/30">
              <CloudOff className="mt-0.5 size-4 shrink-0" />
              <div>
                You&apos;re offline. You need to be online once to set up your
                profile. Reconnect and try again.
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive-foreground">
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!canSubmit}
            title={offline ? "Offline — reconnect to join" : undefined}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Setting up…
              </>
            ) : memberByName ? (
              "Sign in"
            ) : (
              "Join"
            )}
          </Button>
        </form>
      </div>
      <OnboardingTour open={tourOpen} onClose={() => setTourOpen(false)} />
      <Dialog
        open={signInOpen}
        onOpenChange={(open) => {
          if (submitting) return;
          setSignInOpen(open);
          if (!open) setPendingSignInMember(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm gap-3 p-5 sm:p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle>
              Sign in as {signInTarget?.name ?? trimmedName}?
            </DialogTitle>
            <DialogDescription>
              You&apos;ll see &ldquo;{signInTarget?.name ?? trimmedName}&rdquo;
              &apos;s picks, meetups, and notifications on this device.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSignInOpen(false);
                setPendingSignInMember(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={signInAsExisting}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
