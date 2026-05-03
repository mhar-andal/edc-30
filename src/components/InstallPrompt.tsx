import { useEffect, useState } from "react";
import { PlusSquare, Share, Smartphone, X } from "lucide-react";

const DISMISS_KEY = "edc.install.ios.dismissed.v1";

interface PlatformState {
  isIos: boolean;
  isSafari: boolean;
  isStandalone: boolean;
}

function detectPlatform(): PlatformState {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { isIos: false, isSafari: false, isStandalone: false };
  }
  const ua = navigator.userAgent || "";
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as Macintosh; detect via touch points
    (navigator.platform === "MacIntel" &&
      typeof navigator.maxTouchPoints === "number" &&
      navigator.maxTouchPoints > 1);
  const isSafari =
    /^((?!chrome|android|crios|fxios|edgios|opios).)*safari/i.test(ua);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { isIos, isSafari, isStandalone };
}

export function InstallPrompt() {
  const [platform, setPlatform] = useState<PlatformState>(() =>
    detectPlatform(),
  );
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setPlatform(detectPlatform());
    function onChange() {
      setPlatform(detectPlatform());
    }
    const mql = window.matchMedia?.("(display-mode: standalone)");
    mql?.addEventListener?.("change", onChange);
    return () => {
      mql?.removeEventListener?.("change", onChange);
    };
  }, []);

  const { isIos, isSafari, isStandalone } = platform;
  if (isStandalone || dismissed) return null;
  if (!isIos) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative rounded-xl border border-primary/30 bg-primary/10 p-4 pr-9">
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <Smartphone className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Install on your iPhone</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Add EDC Schedule to your home screen for full-screen launch, faster
          loads, and offline access.
        </p>
        {!isSafari && (
          <p className="rounded-md bg-amber-500/15 px-2 py-1.5 text-[11px] text-amber-200 ring-1 ring-amber-500/30">
            Open this page in Safari to install — Chrome and other iOS browsers
            don&apos;t support &ldquo;Add to Home Screen&rdquo;.
          </p>
        )}
        <ol className="space-y-1.5 text-xs">
          <li className="flex items-center gap-2">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
              1
            </span>
            <span className="flex flex-wrap items-center gap-1">
              Tap the
              <span className="inline-flex items-center gap-0.5 rounded bg-background/40 px-1 py-0.5 font-medium text-foreground">
                <Share className="size-3" />
                Share
              </span>
              button
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
              2
            </span>
            <span className="flex flex-wrap items-center gap-1">
              Choose
              <span className="inline-flex items-center gap-0.5 rounded bg-background/40 px-1 py-0.5 font-medium text-foreground">
                <PlusSquare className="size-3" />
                Add to Home Screen
              </span>
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}
