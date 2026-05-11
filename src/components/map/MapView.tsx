import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  FESTIVAL_MAP_ASPECT,
  FESTIVAL_MAP_HEIGHT,
  FESTIVAL_MAP_IMAGE_URL,
  FESTIVAL_MAP_WIDTH,
} from "@/lib/festivalMap";
import { PinMarker } from "./PinMarker";
import { cn } from "@/lib/utils";

export interface MapPin {
  /** Stable React key. */
  id: string;
  /** Normalized [0..1] horizontal position. */
  x: number;
  /** Normalized [0..1] vertical position. */
  y: number;
  /** Pin tint, hex string. */
  color: string;
  /** Optional accessible label / tooltip text. */
  label?: string;
  /** When true, the pin pulses to draw attention. */
  highlight?: boolean;
  /** Single-character label rendered inside the pin's white dot. */
  badge?: string;
  /** Click handler — only fires on a clean click (not after a pan). */
  onClick?: () => void;
}

interface Props {
  /** Pins to render on top of the map. */
  pins: ReadonlyArray<MapPin>;
  /**
   * If provided, taps on the map (not on a pin) call this with the
   * normalized [0..1] coordinates of the tap. Used by the picker
   * variant; omit for read-only viewing.
   */
  onMapTap?: (point: { x: number; y: number }) => void;
  /**
   * Lower bound on zoom. Defaults to 1 (= "fit to container").
   * Set <1 to allow zooming further out.
   */
  minScale?: number;
  /** Upper bound on zoom. Defaults to 6. */
  maxScale?: number;
  /** Initial scale on mount. Defaults to 1. */
  initialScale?: number;
  /** Class applied to the outer container. */
  className?: string;
  /**
   * Extra overlay rendered above the pins, inside the transform.
   * Used by the picker to render the in-progress draft pin.
   */
  draftOverlay?: ReactNode;
  /**
   * When true, renders +/-/reset zoom controls on the bottom-right.
   * Defaults to true.
   */
  showZoomControls?: boolean;
}

/**
 * Pinch-zoom + pan festival map with absolutely-positioned pins.
 *
 * The wrapper sizes itself to its parent's width and uses the map's
 * native aspect ratio for height. Pins are positioned via percentage
 * offsets so they ride along correctly under any zoom/pan. Tapping
 * an empty area of the map (when `onMapTap` is provided) snaps the
 * tap location to normalized coordinates.
 *
 * Tap-vs-pan disambiguation: we register the pointer-down position
 * and only treat the up-event as a tap if the pointer barely moved.
 * react-zoom-pan-pinch's own pan handler still gets the events; the
 * tap detector lives on a dedicated invisible overlay above the
 * image but below the pins.
 */
export function MapView({
  pins,
  onMapTap,
  minScale = 1,
  maxScale = 6,
  initialScale = 1,
  className,
  draftOverlay,
  showZoomControls = true,
}: Props) {
  const wrapperApiRef = useRef<ReactZoomPanPinchRef | null>(null);
  const tapStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track the rendered size of the image so taps can be converted
  // to normalized coordinates regardless of how the browser scaled
  // the image (CSS sizing may differ from natural pixels).
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const r = entry.contentRect;
        if (r.width > 0 && r.height > 0) {
          setImgSize({ w: r.width, h: r.height });
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleTapStart = useCallback((e: React.PointerEvent) => {
    tapStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      t: performance.now(),
    };
  }, []);

  const handleTapEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onMapTap || !imgSize) {
        tapStartRef.current = null;
        return;
      }
      const start = tapStartRef.current;
      tapStartRef.current = null;
      if (!start) return;
      // Tap heuristic: under 6px of movement and under 400ms.
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      const dt = performance.now() - start.t;
      if (dx > 6 || dy > 6 || dt > 400) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      onMapTap({ x, y });
    },
    [onMapTap, imgSize],
  );

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-lg border border-border/60 bg-black/40",
        className,
      )}
      // `touch-action: none` makes the browser hand raw touch events
      // straight to react-zoom-pan-pinch's pan / pinch handlers
      // instead of consuming them for page scroll. Without this,
      // touching the map and dragging when zoomed-in scrolls the
      // page rather than panning the map.
      style={{ aspectRatio: `${FESTIVAL_MAP_ASPECT}`, touchAction: "none" }}
    >
      <TransformWrapper
        ref={wrapperApiRef}
        minScale={minScale}
        maxScale={maxScale}
        initialScale={initialScale}
        centerOnInit
        // Don't let the wrapper rebound to a smaller size as the user
        // pans — bounded panning at scale > 1 is what makes "move
        // around the map when zoomed in" work intuitively.
        limitToBounds
        wheel={{ step: 0.2 }}
        doubleClick={{ disabled: false, step: 0.7 }}
        pinch={{ step: 5 }}
        panning={{
          velocityDisabled: false,
          allowLeftClickPan: true,
        }}
      >
        <TransformComponent
          wrapperStyle={{
            width: "100%",
            height: "100%",
            // The wrapper itself also disables browser touch defaults
            // so a touch that lands inside the transform is forwarded
            // to the pan handler regardless of which inner div the
            // hit-test resolves to.
            touchAction: "none",
          }}
          contentStyle={{
            width: "100%",
            height: "100%",
          }}
        >
          <div
            ref={containerRef}
            className="relative h-full w-full"
            style={{ touchAction: "none" }}
          >
            <img
              src={FESTIVAL_MAP_IMAGE_URL}
              alt="EDC Las Vegas festival map"
              draggable={false}
              width={FESTIVAL_MAP_WIDTH}
              height={FESTIVAL_MAP_HEIGHT}
              className="pointer-events-none block h-full w-full select-none"
              style={{ objectFit: "cover", touchAction: "none" }}
            />

            {onMapTap && (
              <div
                className="absolute inset-0 z-10"
                style={{ touchAction: "none" }}
                onPointerDown={handleTapStart}
                onPointerUp={handleTapEnd}
              />
            )}

            {/* Pin layer sits above the tap overlay so pin clicks
                 take priority over map taps. */}
            <div className="pointer-events-none absolute inset-0 z-20">
              {pins.map((p) => (
                <PinAt
                  key={p.id}
                  pin={p}
                  // Pin clicks should not trigger the map tap detector,
                  // so we stop pointer-down propagation in PinAt.
                />
              ))}
              {draftOverlay}
            </div>
          </div>
        </TransformComponent>
      </TransformWrapper>

      {showZoomControls && (
        <ZoomControls
          onZoomIn={() => wrapperApiRef.current?.zoomIn(0.4)}
          onZoomOut={() => wrapperApiRef.current?.zoomOut(0.4)}
          onReset={() => wrapperApiRef.current?.resetTransform(200)}
        />
      )}
    </div>
  );
}

/**
 * Single positioned pin. Click handler fires only on a clean tap —
 * dragging from a pin starts a pan instead, so the user can start a
 * pan gesture from anywhere on the map (including on top of a pin).
 *
 * We rely on `onClick` (rather than `onPointerUp`) for activation
 * because browsers already suppress click after a drag, which gives
 * us free tap-vs-pan disambiguation. The only pointer-event handler
 * we add is `onPointerUp` with `stopPropagation` so a clean release
 * on a pin doesn't also trigger the map-tap detector beneath it.
 */
function PinAt({ pin }: { pin: MapPin }) {
  const interactive = !!pin.onClick;
  return (
    <div
      className={cn(
        "absolute pointer-events-auto",
        interactive && "cursor-pointer",
      )}
      style={{
        left: `${pin.x * 100}%`,
        top: `${pin.y * 100}%`,
        transform: "translate(-50%, -100%)",
        touchAction: "none",
      }}
      onPointerUp={(e) => {
        // Suppress the map-tap detector so tapping a pin doesn't
        // also drop a new pin underneath it.
        e.stopPropagation();
      }}
      onClick={() => pin.onClick?.()}
      title={pin.label}
    >
      <PinMarker
        color={pin.color}
        highlight={pin.highlight}
        badge={pin.badge}
        ariaLabel={pin.label ?? "Map pin"}
      />
    </div>
  );
}

function ZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  return (
    <div className="absolute bottom-3 right-3 z-30 flex flex-col overflow-hidden rounded-md border border-border/70 bg-background/85 shadow-md backdrop-blur">
      <button
        type="button"
        onClick={onZoomIn}
        className="inline-flex size-8 items-center justify-center text-foreground transition-colors hover:bg-secondary"
        aria-label="Zoom in"
      >
        <Plus className="size-4" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        className="inline-flex size-8 items-center justify-center border-t border-border/60 text-foreground transition-colors hover:bg-secondary"
        aria-label="Zoom out"
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex size-8 items-center justify-center border-t border-border/60 text-foreground transition-colors hover:bg-secondary"
        aria-label="Reset zoom"
      >
        <RotateCcw className="size-4" />
      </button>
    </div>
  );
}
