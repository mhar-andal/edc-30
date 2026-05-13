import { useLayoutEffect, useRef, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { MemberChip } from "@/components/MemberChip";
import { useAutoScroll } from "@/lib/useAutoScroll";
import type { Member } from "@/lib/useScheduleData";

/**
 * Single-line, horizontally auto-scrolling row of "who's coming" chips.
 *
 * Used by both the Schedule view's `ArtistCard` and the Quick Pick
 * walkthrough so attendee rows behave identically across surfaces:
 *
 * - When the chips fit, they sit on one line — no scrolling, no
 *   duplicate set.
 * - When they overflow, the strip auto-marquees with a seamless loop
 *   by rendering a duplicate copy and using `getLoopWidth` to lock to
 *   the pixel-accurate wrap point (see comments inside).
 *
 * The session user is highlighted via `isYou` so the row never
 * silently drops them.
 *
 * Empty-state copy is returned in place of chips when nobody (or no
 * one but the viewer, depending on the host's filter) has picked yet.
 */
export function AttendeesStrip({
  pickedByMemberIds,
  membersById,
  myMemberId,
  emptyLabel,
}: {
  pickedByMemberIds: ReadonlyArray<Id<"members">>;
  membersById: Map<string, Member>;
  myMemberId: Id<"members"> | null;
  /**
   * Optional override for the empty-state text. Defaults to
   * "Be the first" when the viewer is signed in, otherwise
   * "No picks yet".
   */
  emptyLabel?: string;
}) {
  const [overflows, setOverflows] = useState(false);
  const firstSetRef = useRef<HTMLDivElement | null>(null);
  const secondSetRef = useRef<HTMLDivElement | null>(null);
  const ref = useAutoScroll<HTMLDivElement>({
    endBehavior: overflows ? "loop" : "reset",
    // The two copies are separated by the outer `gap-1` (4px), so
    // `scrollWidth / 2` is ~2px short of the true seamless wrap point.
    // Measuring the second copy's position gives a pixel-accurate loop
    // distance and eliminates the visible jitter on every cycle — most
    // obvious on narrow mobile rows with just a few attendees.
    getLoopWidth: () => {
      const first = firstSetRef.current;
      const second = secondSetRef.current;
      if (!first || !second) return null;
      return second.offsetLeft - first.offsetLeft;
    },
  });

  const chips = pickedByMemberIds
    .map((mid) => {
      const m = membersById.get(mid);
      if (!m) return null;
      return { mid, member: m, isYou: mid === myMemberId };
    })
    .filter(
      (x): x is { mid: Id<"members">; member: Member; isYou: boolean } =>
        x !== null,
    );

  // Track whether the first chip set actually overflows the visible
  // strip width. We only render the duplicate set when it does, so
  // non-overflowing rows don't visually duplicate every name.
  useLayoutEffect(() => {
    const container = ref.current;
    const firstSet = firstSetRef.current;
    if (!container || !firstSet) return;
    function check() {
      if (!container || !firstSet) return;
      setOverflows(firstSet.scrollWidth > container.clientWidth + 1);
    }
    const ro = new ResizeObserver(check);
    ro.observe(container);
    ro.observe(firstSet);
    check();
    return () => ro.disconnect();
  }, [ref, chips.length]);

  if (chips.length === 0) {
    return (
      <span className="text-[10px] text-muted-foreground/70">
        {emptyLabel ?? (myMemberId ? "Be the first" : "No picks yet")}
      </span>
    );
  }

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="-mx-0.5 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div ref={firstSetRef} className="flex shrink-0 items-center gap-1">
        {chips.map(({ mid, member, isYou }) => (
          <MemberChip
            key={mid}
            name={member.name}
            color={member.color}
            size="xs"
            isYou={isYou}
            className="shrink-0"
          />
        ))}
      </div>
      {overflows && (
        <div
          ref={secondSetRef}
          aria-hidden
          className="flex shrink-0 items-center gap-1"
        >
          {chips.map(({ mid, member, isYou }) => (
            <MemberChip
              key={`dup-${mid}`}
              name={member.name}
              color={member.color}
              size="xs"
              isYou={isYou}
              className="shrink-0"
            />
          ))}
        </div>
      )}
    </div>
  );
}
