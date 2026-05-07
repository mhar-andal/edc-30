import { useEffect, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  Clock,
  MapPin,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOUR_KEY = "edc.tour.seen.v1";
const TOUR_STEP_KEY = "edc.tour.step.v1";

export function hasSeenTour(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(TOUR_KEY) === "1";
}

export function markTourSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOUR_KEY, "1");
  window.localStorage.removeItem(TOUR_STEP_KEY);
}

export function isTourInProgress(): boolean {
  if (typeof window === "undefined") return false;
  if (hasSeenTour()) return false;
  return window.localStorage.getItem(TOUR_STEP_KEY) !== null;
}

export function restartTour(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOUR_STEP_KEY);
}

interface Step {
  title: string;
  body: string;
  visual: React.ReactNode;
}

const STEPS: Step[] = [
  {
    title: "Coordinate your EDC weekend",
    body: "Pick the sets you want to see, plan side activities with friends, and find natural meetup moments along the way.",
    visual: <HeroVisual />,
  },
  {
    title: "Plan it in minutes with Quick pick",
    body: "Tell us when you'll arrive each day, then we walk you through ~30-minute windows. Pick anyone you'd catch in that block — pick two if you want to do half-and-half. Exit any time and pick up where you left off.",
    visual: <QuickPickVisual />,
  },
  {
    title: "Pick sets — see who's going",
    body: "Tap a set to add it to your picks. Friends' picks appear color-coded next to yours on every set, so you can see who's heading where.",
    visual: <PeopleVisual />,
  },
  {
    title: "Spot overlapping sets",
    body: "If a set you're eyeing collides with one you've already picked, we'll flag it. You can still pick both — handy if you want to leave one early.",
    visual: <OverlapVisual />,
  },
  {
    title: "Your day on a single timeline",
    body: "Switch to My Day to see your picks, joined meetups, and any sidequests (food runs, art cars, rest breaks) laid out as a single column timeline.",
    visual: <MyDayVisual />,
  },
  {
    title: "Find meetup moments",
    body: "When friends split between stages but converge on the same set next, we surface a meetup window on Coordinate. Pick a spot and a gather → leave time so everyone knows when to roll.",
    visual: <MeetupVisual />,
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

function readSavedStep(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(TOUR_STEP_KEY);
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), STEPS.length - 1);
}

function saveStep(step: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOUR_STEP_KEY, String(step));
}

export function OnboardingTour({ open, onClose }: Props) {
  const [step, setStep] = useState<number>(() => readSavedStep());
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  // When the dialog opens, sync to whatever step is currently saved (so a
  // user who left the tour at step 3 in onboarding resumes at step 3 from
  // the schedule resume banner).
  useEffect(() => {
    if (open) setStep(readSavedStep());
  }, [open]);

  // Persist progress whenever the step changes while the tour is open. We
  // only treat the tour as "completed" when the user actually reaches the
  // end and presses "Let's go" — early dismissals leave the saved step in
  // place so we can show a resume entry point on the schedule.
  useEffect(() => {
    if (!open) return;
    saveStep(step);
  }, [open, step]);

  function dismiss() {
    onClose();
  }
  function complete() {
    markTourSeen();
    setStep(0);
    onClose();
  }
  function next() {
    if (isLast) complete();
    else setStep((s) => s + 1);
  }
  function back() {
    if (!isFirst) setStep((s) => s - 1);
  }

  const current = STEPS[step];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) dismiss();
      }}
    >
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md overflow-hidden border-border/60 bg-card p-0 sm:rounded-2xl">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={dismiss}
          className="absolute right-2 top-2 z-10 size-8 rounded-full bg-background/80 text-muted-foreground shadow-sm ring-1 ring-border/40 backdrop-blur hover:bg-background hover:text-foreground"
          aria-label="Close tour"
        >
          <X className="size-3.5" />
        </Button>

        <div className="relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br from-rose-500/15 via-fuchsia-500/15 to-cyan-500/15 sm:h-56">
          {current.visual}
        </div>

        <div className="px-6 pb-2 pt-5">
          <h2 className="text-lg font-semibold leading-tight sm:text-xl">
            {current.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {current.body}
          </p>
        </div>

        <div className="flex justify-center gap-1.5 py-4">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step
                  ? "w-6 bg-primary"
                  : i < step
                    ? "w-1.5 bg-primary/40"
                    : "w-1.5 bg-muted-foreground/25",
              )}
            />
          ))}
        </div>

        <div
          className={cn(
            "flex items-center gap-2 border-t border-border/40 bg-background/40 p-3",
            isFirst ? "justify-end" : "justify-between",
          )}
        >
          {!isFirst && (
            <Button variant="ghost" size="sm" onClick={back}>
              <ChevronLeft className="size-4" />
              Back
            </Button>
          )}
          <Button onClick={next} size="sm" className="min-w-[6rem]">
            {isLast ? "Let's go" : "Next"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeroVisual() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 text-center">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-medium text-primary">
        <Sparkles className="size-3" />
        EDC Las Vegas · May 15–17, 2026
      </div>
      <div className="text-3xl font-black tracking-tight">
        <span className="bg-gradient-to-r from-rose-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
          EDC
        </span>{" "}
        Coordinate
      </div>
    </div>
  );
}

function QuickPickVisual() {
  return (
    <div className="w-full max-w-[260px] px-4">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
            <Sparkles className="size-2.5" />
            Quick pick
          </span>
          <span className="text-[9px] tabular-nums text-muted-foreground">
            Fri · 3 / 6
          </span>
        </div>
        <div className="space-y-1.5 px-3 py-2">
          <div className="text-[11px] font-semibold leading-tight">
            Friday · 11:15pm – 11:30pm
          </div>
          <div className="text-[9px] leading-tight text-muted-foreground">
            These sets all start within ~30 minutes — pick anyone you&apos;d
            catch.
          </div>
          <div className="space-y-1 pt-0.5">
            <MockArtistCard
              stage="Kinetic Field"
              name="Sofi Tukker"
              status="picked"
            />
            <MockArtistCard stage="Basspod" name="Levity" status="add" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MyDayVisual() {
  return (
    <div className="flex w-full max-w-[260px] flex-col gap-1.5 px-4">
      <div className="mb-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
        <CalendarClock className="size-2.5" />
        My Day · Friday
      </div>
      <MyDayRow
        time="9pm"
        label="Hardwell"
        sublabel="Kinetic Field"
        rgb="244 63 94"
      />
      <MyDayRow
        time="9:50"
        label="Meet · Electric Avenue"
        sublabel="with Alex, Sam"
        rgb="16 185 129"
      />
      <MyDayRow
        time="10pm"
        label="Subtronics"
        sublabel="Cosmic Meadow"
        rgb="132 204 22"
      />
      <MyDayRow
        time="11pm"
        label="Sidequest · Food run"
        sublabel="Sushi pop-up"
        rgb="139 92 246"
      />
    </div>
  );
}

function MyDayRow({
  time,
  label,
  sublabel,
  rgb,
}: {
  time: string;
  label: string;
  sublabel: string;
  rgb: string;
}) {
  return (
    <div className="grid grid-cols-[2.25rem_1fr] items-start gap-2">
      <span className="pt-0.5 text-right text-[9px] tabular-nums text-muted-foreground">
        {time}
      </span>
      <div
        className="rounded-md border px-2 py-1 leading-tight"
        style={{
          backgroundColor: `rgb(${rgb} / 0.18)`,
          borderColor: `rgb(${rgb} / 0.45)`,
        }}
      >
        <div
          className="text-[10px] font-semibold"
          style={{ color: `rgb(${rgb})` }}
        >
          {label}
        </div>
        <div className="text-[9px] text-muted-foreground">{sublabel}</div>
      </div>
    </div>
  );
}

function PeopleVisual() {
  return (
    <div className="w-full max-w-[260px] px-4">
      <MockArtistCard
        stage="Kinetic Field"
        name="Hardwell"
        status="picked"
        chips={[
          { name: "Alex", color: "#fb923c" },
          { name: "Sam", color: "#22d3ee" },
          { name: "Riley", color: "#a3e635" },
        ]}
        extraChipCount={2}
      />
    </div>
  );
}

function OverlapVisual() {
  return (
    <div className="flex w-full max-w-[260px] flex-col gap-2 px-4">
      <MockArtistCard stage="Kinetic Field" name="Subtronics" status="picked" />
      <MockArtistCard
        stage="Basspod"
        name="Eptic B2B Space Laces"
        status="add"
        overlapWith="Subtronics"
      />
    </div>
  );
}

function MeetupVisual() {
  return (
    <div className="w-full max-w-[260px] px-4">
      <div className="rounded-xl border border-border/60 bg-card/80 p-3">
        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold tabular-nums">
          <span className="whitespace-nowrap">Gather 9:50 – 10:00pm</span>
          <span
            className="inline-flex items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[10px]"
            style={{
              backgroundColor: "rgb(244 63 94 / 0.2)",
              color: "rgb(244 63 94)",
            }}
          >
            <span
              className="size-1 shrink-0 rounded-full"
              style={{ backgroundColor: "rgb(244 63 94)" }}
            />
            → Kinetic Field
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <MockChip name="Alex" color="#fb7185" />
          <span className="text-[10px] text-muted-foreground">×</span>
          <MockChip name="You" color="#22d3ee" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200 ring-1 ring-emerald-500/40">
            <MapPin className="size-2.5" />
            Electric Avenue Sign
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-sky-200 ring-1 ring-sky-500/40">
            <Clock className="size-2.5" />
            10 min window
          </span>
        </div>
      </div>
    </div>
  );
}

function MockArtistCard({
  name,
  stage,
  status,
  chips,
  extraChipCount,
  overlapWith,
}: {
  name: string;
  stage: string;
  status: "add" | "picked";
  chips?: Array<{ name: string; color: string }>;
  extraChipCount?: number;
  overlapWith?: string;
}) {
  const stageRgb =
    stage === "Kinetic Field"
      ? "244 63 94"
      : stage === "Basspod"
        ? "139 92 246"
        : stage === "Cosmic Meadow"
          ? "132 204 22"
          : "115 115 115";
  return (
    <div
      className="w-full overflow-hidden rounded-md border p-2 text-left"
      style={{
        backgroundColor: `rgb(${stageRgb} / 0.18)`,
        borderColor: `rgb(${stageRgb} / 0.45)`,
      }}
    >
      <div className="truncate text-xs font-semibold leading-tight">{name}</div>
      <div className="mt-0.5 truncate text-[9px] tabular-nums text-muted-foreground">
        {stage} · 9pm – 10pm
      </div>
      {overlapWith && (
        <div className="mt-1 inline-flex max-w-full items-center gap-1 truncate rounded-md bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-200 ring-1 ring-amber-500/40">
          <span>⚠ Overlaps with {overlapWith}</span>
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1">
        {status === "add" ? (
          <span className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full border border-dashed border-foreground/30 px-1.5 text-[9px] font-medium text-muted-foreground">
            <Plus className="size-2" />
            Add
          </span>
        ) : (
          <span className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full bg-primary/15 px-1.5 text-[9px] font-medium text-primary">
            ✓ Picked
          </span>
        )}
        {chips && chips.length > 0 && (
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {chips.map((c) => (
              <MockChip key={c.name} name={c.name} color={c.color} />
            ))}
            {extraChipCount && extraChipCount > 0 ? (
              <span className="inline-flex h-4 shrink-0 items-center rounded-full border border-border/60 bg-card/60 px-1.5 text-[9px] font-medium text-muted-foreground">
                +{extraChipCount}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function MockChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex h-4 items-center gap-1 rounded-full border border-border/60 bg-card/60 px-1.5 text-[9px] font-medium">
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </span>
  );
}
