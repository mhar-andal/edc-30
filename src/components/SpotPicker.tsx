import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Built-in suggestions surfaced first in every spot picker. Keeping
 * the canonical list in one place ensures convergence and sidequest
 * pickers always start from the same baseline of festival landmarks.
 */
export const DEFAULT_SPOTS = [
  "Electric Avenue Sign",
  "Basspod GA Bathrooms",
  "Kinetic Field Entrance",
] as const;

interface Props {
  /** Currently chosen label, or null when nothing is selected. */
  value: string | null;
  /**
   * Called whenever the user picks a different chip, types a custom
   * label, or taps the currently-selected chip to clear it. Receives
   * `null` when the value is being cleared.
   */
  onChange: (next: string | null) => Promise<void> | void;
  /**
   * Previously-used labels (typically merged from `meetups.listLabels`
   * and `sidequests.listLabels`). Already-deduped order is honored —
   * the most-frequently-used labels should come first.
   */
  knownLabels: ReadonlyArray<string>;
  defaultSpots?: ReadonlyArray<string>;
  disabled?: boolean;
  disabledReason?: string;
  /** Displayed above the chip row. */
  heading?: string;
  inputPlaceholder?: string;
  /**
   * When true, tapping the active chip clears the value. Disable for
   * forms that require a selection.
   */
  allowToggleOff?: boolean;
}

/**
 * Chip-based spot picker shared by convergences and sidequests.
 * Renders default spots + recent labels + the currently-selected
 * label, plus an "Other…" affordance that toggles to an inline
 * text input for one-off custom spots. The component is purely
 * controlled — persistence is the parent's concern.
 */
export function SpotPicker({
  value,
  onChange,
  knownLabels,
  defaultSpots = DEFAULT_SPOTS,
  disabled = false,
  disabledReason,
  heading = "Meet at",
  inputPlaceholder = "e.g. by the LED tower",
  allowToggleOff = true,
}: Props) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherDraft, setOtherDraft] = useState("");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const otherInputRef = useRef<HTMLInputElement | null>(null);

  // Merge canonical defaults + recent labels + currently-selected
  // (so an unfamiliar custom value stays visible as a chip).
  const chips = useMemo(() => {
    const set = new Set<string>(defaultSpots);
    for (const label of knownLabels) set.add(label);
    if (value) set.add(value);
    return Array.from(set);
  }, [knownLabels, value, defaultSpots]);

  useEffect(() => {
    if (otherOpen) setTimeout(() => otherInputRef.current?.focus(), 0);
    else setOtherDraft("");
  }, [otherOpen]);

  async function pick(label: string) {
    if (disabled) return;
    setBusyLabel(label);
    try {
      if (value === label && allowToggleOff) {
        await onChange(null);
      } else {
        await onChange(label);
      }
    } finally {
      setBusyLabel(null);
    }
  }

  async function commitOther() {
    const trimmed = otherDraft.trim();
    if (!trimmed || disabled) return;
    setOtherOpen(false);
    await pick(trimmed);
  }

  return (
    <div className="space-y-2">
      {heading && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <MapPin className="size-3" />
          {heading}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((label) => {
          const isChosen = value === label;
          const isBusy = busyLabel === label;
          return (
            <button
              key={label}
              type="button"
              disabled={disabled || isBusy}
              onClick={() => void pick(label)}
              title={
                disabled
                  ? disabledReason
                  : isChosen && allowToggleOff
                    ? "Tap again to clear"
                    : `Set meet spot to ${label}`
              }
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                isChosen
                  ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-500/50 hover:bg-emerald-500/30"
                  : "border border-border/60 bg-background/40 text-foreground hover:bg-background",
              )}
            >
              {isChosen && <Check className="size-3" />}
              {label}
            </button>
          );
        })}
        {!otherOpen ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOtherOpen(true)}
            title={disabled ? disabledReason : "Add a custom meet spot"}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border/60 bg-background/40 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-3" />
            Other
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <Input
              ref={otherInputRef}
              value={otherDraft}
              onChange={(e) => setOtherDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitOther();
                }
                if (e.key === "Escape") setOtherOpen(false);
              }}
              placeholder={inputPlaceholder}
              maxLength={48}
              className="h-7 w-44 px-2 text-[11px]"
            />
            <button
              type="button"
              onClick={() => void commitOther()}
              disabled={!otherDraft.trim() || disabled}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
              aria-label="Save custom spot"
            >
              <Check className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => setOtherOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Cancel"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
