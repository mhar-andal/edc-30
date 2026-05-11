/**
 * Festival map asset + pin-color palette shared across the map view
 * and pin pickers. Coordinates throughout the app are normalized to
 * [0, 1] so they stay correct if the underlying image is ever
 * swapped for a different resolution or aspect-ratio crop.
 */

/**
 * The map asset lives in `public/` so the browser can fetch it as a
 * static file (PWA precache included). Using a string path keeps it
 * out of the JS bundle.
 */
export const FESTIVAL_MAP_IMAGE_URL =
  "/edclv_2026_de_festival_map_1080x1350_r05_blurred.jpg";

/** Native pixel dimensions of {@link FESTIVAL_MAP_IMAGE_URL}. */
export const FESTIVAL_MAP_WIDTH = 1080;
export const FESTIVAL_MAP_HEIGHT = 1350;
export const FESTIVAL_MAP_ASPECT = FESTIVAL_MAP_WIDTH / FESTIVAL_MAP_HEIGHT;

/**
 * Bright, distinguishable pin colors. Picked for visibility against
 * the map's neon-saturated background. Each entry has a friendly
 * name (used in tooltips / accessibility labels) and the hex value
 * persisted to the database.
 */
export interface PinColorOption {
  name: string;
  value: `#${string}`;
}

export const PIN_COLORS: ReadonlyArray<PinColorOption> = [
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#facc15" },
  { name: "Lime", value: "#84cc16" },
  { name: "Cyan", value: "#22d3ee" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Magenta", value: "#ec4899" },
  { name: "White", value: "#ffffff" },
];

export const DEFAULT_PIN_COLOR = PIN_COLORS[0].value;

/**
 * Hex regex used to validate any user-supplied pin color before we
 * save it. Matches the server-side validator in `meetups.ts` /
 * `sidequests.ts`.
 */
export const PIN_HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidPinColor(color: unknown): color is `#${string}` {
  return typeof color === "string" && PIN_HEX_RE.test(color);
}
