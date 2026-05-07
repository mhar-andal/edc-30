import { useEffect, useLayoutEffect, useRef } from "react";

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
  /**
   * In `"loop"` mode, the exact scrollLeft distance at which to wrap back
   * to 0. Provide this when the two rendered copies are separated by a
   * flex `gap` (or any spacing) so `scrollWidth / 2` is not the true
   * seamless wrap point. Typically this is
   * `secondCopyRef.current.offsetLeft - firstCopyRef.current.offsetLeft`.
   *
   * Return `null`/`undefined`/`0` to fall back to `scrollWidth / 2`.
   */
  getLoopWidth?: () => number | null | undefined;
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
    getLoopWidth,
  } = options;

  // Keep the latest getLoopWidth accessible inside the rAF loop without
  // re-subscribing on every render.
  const getLoopWidthRef = useRef(getLoopWidth);
  useLayoutEffect(() => {
    getLoopWidthRef.current = getLoopWidth;
  });

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

      // In loop mode the consumer renders the content twice. The
      // seamless wrap point is the x-offset of the second copy within
      // the scroller — if the consumer provides it (e.g. via
      // `secondCopy.offsetLeft - firstCopy.offsetLeft`), use it.
      // Otherwise fall back to `scrollWidth / 2`, which is correct only
      // when there's no spacing between the two copies.
      let halfWidth = 0;
      if (endBehavior === "loop") {
        const measured = getLoopWidthRef.current?.();
        halfWidth =
          measured && measured > 0 ? measured : node!.scrollWidth / 2;
      }
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
      // Update the expected value BEFORE writing scrollLeft. Some
      // browsers dispatch the scroll event synchronously (or very
      // early) after a programmatic scrollLeft change; if we updated
      // the expected value afterwards, the scroll handler could see a
      // large diff (e.g. old 263 vs new 0 on wrap) and incorrectly
      // bump the interaction pause every single cycle, which feels
      // like the marquee is juddering/stalling on mobile.
      lastExpectedScrollLeft = accumulator;
      node!.scrollLeft = accumulator;
    }

    function onUserInteract() {
      bumpPause();
    }

    function onScroll() {
      // 4px of slack absorbs sub-pixel rounding and any minor drift
      // between what we wrote and what the browser actually stored.
      // Real user drags always produce a much larger delta.
      if (Math.abs(node!.scrollLeft - lastExpectedScrollLeft) > 4) {
        bumpPause();
        accumulator = node!.scrollLeft;
      }
      lastExpectedScrollLeft = node!.scrollLeft;
    }

    node.addEventListener("touchstart", onUserInteract, { passive: true });
    node.addEventListener("pointerdown", onUserInteract, { passive: true });
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
