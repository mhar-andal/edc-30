import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { CloudOff, HelpCircle, Loader2, Sparkles, Users } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/ColorPicker";
import { InstallPrompt } from "@/components/InstallPrompt";
import { MemberDot } from "@/components/MemberDot";
import {
  OnboardingTour,
  hasSeenTour,
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
  const memberByName = useMemo(() => {
    if (!members || !trimmedName) return undefined;
    return members.find(
      (m) => m.name.toLowerCase() === trimmedName.toLowerCase(),
    );
  }, [members, trimmedName]);

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
    !memberByName &&
    !!memberColor;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const memberId = await createMember({
        name: trimmedName,
        color: memberColor,
      });
      writeStored({ memberId, memberName: trimmedName });
      navigate("/schedule", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      if (message.includes("NAME_TAKEN")) {
        setError("That name is already taken. Try another.");
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
            Pick your name to join. You'll be able to copy another member's
            picks once you're in.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setTourOpen(true)}
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
            <div className="flex flex-wrap items-center gap-2">
              {(members ?? []).slice(0, 30).map((m) => (
                <div
                  key={m._id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2 py-0.5"
                  title={m.name}
                >
                  <MemberDot color={m.color} />
                  <span className="text-[11px]">{m.name}</span>
                </div>
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
              <p className="mt-1.5 text-xs text-amber-400">
                &ldquo;{memberByName.name}&rdquo; is already in use. Pick another name.
              </p>
            )}
          </div>
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
            ) : (
              "Join the workspace"
            )}
          </Button>
        </form>
      </div>
      <OnboardingTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}
