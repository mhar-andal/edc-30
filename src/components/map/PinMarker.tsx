import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Pin tint as hex. */
  color: string;
  /** Visual size in CSS pixels (approximate, before any zoom transform). */
  size?: number;
  /** Render with a subtle pulse animation to call attention to it. */
  highlight?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Optional letter / icon rendered in the white center dot. */
  badge?: string;
  /** A11y label. */
  ariaLabel?: string;
}

/**
 * Classic teardrop map pin. The point of the teardrop sits exactly
 * at the bottom-center of the SVG, so positioning the marker with
 * `translate(-50%, -100%)` plants the tip on the geographic point.
 *
 * Visuals are intentionally loud — bright fill, white stroke, drop
 * shadow — so pins stay readable against the map's busy
 * neon-saturated background.
 */
export function PinMarker({
  color,
  size = 32,
  highlight = false,
  className,
  style,
  badge,
  ariaLabel,
}: Props) {
  const w = size;
  const h = Math.round(size * 1.28);
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn(
        "pointer-events-none relative",
        highlight && "animate-pulse",
        className,
      )}
      style={{ width: w, height: h, ...style }}
    >
      <svg
        viewBox="0 0 32 41"
        width={w}
        height={h}
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6))" }}
      >
        <path
          d="M16 0.5 C7.44 0.5 0.5 7.44 0.5 16 C0.5 27 16 40.5 16 40.5 C16 40.5 31.5 27 31.5 16 C31.5 7.44 24.56 0.5 16 0.5 Z"
          fill={color}
          stroke="#ffffff"
          strokeWidth="2"
        />
        <circle cx="16" cy="16" r="5.5" fill="#ffffff" />
        {badge && (
          <text
            x="16"
            y="20"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill={color}
          >
            {badge}
          </text>
        )}
      </svg>
    </div>
  );
}
