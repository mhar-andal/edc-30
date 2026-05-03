import { useState } from "react";
import { ChevronLeft, Clock, MapPin, Plus, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOUR_KEY = "edc.tour.seen.v1";

export function hasSeenTour(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(TOUR_KEY) === "1";
}

export function markTourSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOUR_KEY, "1");
}

interface Step {
  title: string;
  body: string;
  visual: React.ReactNode;
}

const STEPS: Step[] = [
  {
    title: "Coordinate your EDC weekend",
    body: "Pick the sets you want to see, share with friends, and find natural meetup points between sets.",
    visual: <HeroVisual />,
  },
  {
    title: "Pick what you want to see",
    body: "Tap a set to add it to your picks. Tap again to remove it.",
    visual: <PickVisual />,
  },
  {
    title: "See who's going with you",
    body: "Your friends' picks appear next to yours on every set — color-coded by person.",
    visual: <PeopleVisual />,
  },
  {
    title: "Spot overlapping sets",
    body: "If a set you're eyeing collides with one you've already picked, we'll flag it. You can still pick both — handy if you want to leave one early.",
    visual: <OverlapVisual />,
  },
  {
    title: "Find meetup moments",
    body: "When you and a friend are at different stages but heading to the same one next, we surface a meetup window. Set a stage or a custom spot — anyone can edit.",
    visual: <MeetupVisual />,
  },
  {
    title: "Copy a friend's picks",
    body: "If a friend already mapped out their night, copy their picks as a starting point and tweak from there.",
    visual: <CopyVisual />,
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function OnboardingTour({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  function close() {
    markTourSeen();
    setStep(0);
    onClose();
  }
  function next() {
    if (isLast) close();
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
        if (!o) close();
      }}
    >
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md overflow-hidden border-border/60 bg-card p-0 sm:rounded-2xl">
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-background/60 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          aria-label="Skip tour"
        >
          <X className="size-4" />
        </button>

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

        <div className="flex items-center gap-2 border-t border-border/40 bg-background/40 p-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={back}
            disabled={isFirst}
            aria-label="Previous"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button onClick={next} className="flex-1">
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

function PickVisual() {
  return (
    <div className="flex w-full max-w-[260px] flex-col gap-2 px-4">
      <MockArtistCard stage="Cosmic Meadow" name="Sub Focus" status="add" />
      <div className="text-center text-[10px] uppercase tracking-wide text-muted-foreground">
        tap →
      </div>
      <MockArtistCard stage="Cosmic Meadow" name="Sub Focus" status="picked" />
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
          <span className="whitespace-nowrap">9:45 – 10:15pm</span>
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
            Kinetic Field
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
            10 – 10:15pm
          </span>
        </div>
      </div>
    </div>
  );
}

function CopyVisual() {
  return (
    <div className="flex w-full max-w-[260px] items-center justify-center gap-3 px-4">
      <MockChip name="Alex" color="#fb7185" />
      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
        copy →
      </span>
      <MockChip name="You" color="#22d3ee" />
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
