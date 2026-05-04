import { useEffect, useRef } from "react";

interface Options {
  /** Speed in CSS pixels per second. */
  pixelsPerSecond?: number;
  /**
   * How long to pause auto-scroll after the user interacts (touch, drag,
   * wheel, or any user-initiated scroll). The pause is bumped on each
   * interaction so it always extends from the most recent gesture.
   */
  pauseAfterInteractionMs?: number;
  /**
   * Behavior when the scroll reaches the end.
   *
   * - `"reset"` (default): jump back to scrollLeft 0.
   * - `"loop"`: assume the consumer has rendered the content twice and
   *   subtract `scrollWidth / 2` from the scroll position to create a
   *   seamless infinite-scroll effect.
   */
  endBehavior?: "reset" | "loop";
}

/**
 * Auto-scrolls a horizontally-overflowing element. Pauses on user
 * interaction (touch / drag / wheel / programmatic scroll mismatch) and
 * resumes after the configured delay. Becomes a no-op while the content
 * fits.
 */
export function useAutoScroll<T extends HTMLElement>(
  options: Options = {},
) {
  const ref = useRef<T | null>(null);
  const {
    pixelsPerSecond = 60,
    pauseAfterInteractionMs = 600,
    endBehavior = "reset",
  } = options;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced) return;

    let rafId = 0;
    let lastTs: number | null = null;
    let pausedUntil = 0;
    // Accumulator stored as a float so sub-pixel speeds animate smoothly
    // even though scrollLeft is set as an integer.
    let accumulator = node.scrollLeft;
    let lastExpectedScrollLeft = node.scrollLeft;

    function bumpPause() {
      pausedUntil = performance.now() + pauseAfterInteractionMs;
      lastTs = null;
    }

    function frame(ts: number) {
      rafId = requestAnimationFrame(frame);

      // In loop mode the consumer renders the content twice, so the
      // "real" content width is half the scroll width. We use that as
      // both the loop point and the overflow check.
      const halfWidth =
        endBehavior === "loop" ? node!.scrollWidth / 2 : 0;
      const overflow =
        endBehavior === "loop"
          ? halfWidth - node!.clientWidth
          : node!.scrollWidth - node!.clientWidth;

      if (overflow <= 1) {
        lastTs = null;
        return;
      }
      if (performance.now() < pausedUntil) {
        lastTs = null;
        return;
      }
      if (lastTs === null) {
        lastTs = ts;
        // If a user gesture moved scrollLeft, sync the accumulator.
        accumulator = node!.scrollLeft;
        return;
      }

      const dt = ts - lastTs;
      lastTs = ts;
      accumulator += (pixelsPerSecond * dt) / 1000;

      if (endBehavior === "loop") {
        if (accumulator >= halfWidth) {
          accumulator -= halfWidth;
        }
      } else if (accumulator >= overflow) {
        accumulator = 0;
      }
      node!.scrollLeft = accumulator;
      lastExpectedScrollLeft = node!.scrollLeft;
    }

    function onUserInteract() {
      bumpPause();
    }

    function onScroll() {
      if (Math.abs(node!.scrollLeft - lastExpectedScrollLeft) > 2) {
        bumpPause();
        accumulator = node!.scrollLeft;
      }
      lastExpectedScrollLeft = node!.scrollLeft;
    }

    node.addEventListener("touchstart", onUserInteract, { passive: true });
    node.addEventListener("pointerdown", onUserInteract);
    node.addEventListener("wheel", onUserInteract, { passive: true });
    node.addEventListener("scroll", onScroll, { passive: true });

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      node.removeEventListener("touchstart", onUserInteract);
      node.removeEventListener("pointerdown", onUserInteract);
      node.removeEventListener("wheel", onUserInteract);
      node.removeEventListener("scroll", onScroll);
    };
  }, [pixelsPerSecond, pauseAfterInteractionMs, endBehavior]);

  return ref;
}
