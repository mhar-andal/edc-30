export type DayKey = "day_1" | "day_2" | "day_3";

export const DAYS: ReadonlyArray<DayKey> = ["day_1", "day_2", "day_3"];

export const DAY_LABELS: Record<DayKey, { full: string; short: string; date: string }> = {
  day_1: { full: "Day 1 · Fri", short: "Fri", date: "May 15" },
  day_2: { full: "Day 2 · Sat", short: "Sat", date: "May 16" },
  day_3: { full: "Day 3 · Sun", short: "Sun", date: "May 17" },
};

const LAS_VEGAS_TZ = "America/Los_Angeles";

const HOUR_MINUTE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: LAS_VEGAS_TZ,
});

const HOUR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hour12: true,
  timeZone: LAS_VEGAS_TZ,
});

const ISO_HOUR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  hour12: false,
  timeZone: LAS_VEGAS_TZ,
});

function isValidMs(ms: unknown): ms is number {
  return typeof ms === "number" && Number.isFinite(ms);
}

export function formatTime(ms: number): string {
  if (!isValidMs(ms)) return "—";
  return HOUR_MINUTE_FORMATTER.format(new Date(ms))
    .replace(" AM", "am")
    .replace(" PM", "pm");
}

export function formatHour(ms: number): string {
  if (!isValidMs(ms)) return "—";
  return HOUR_FORMATTER.format(new Date(ms))
    .replace(" AM", "am")
    .replace(" PM", "pm");
}

export function localHour(ms: number): number {
  if (!isValidMs(ms)) return NaN;
  return parseInt(ISO_HOUR_FORMATTER.format(new Date(ms)), 10);
}

export function isLateNight(ms: number): boolean {
  const h = localHour(ms);
  if (Number.isNaN(h)) return false;
  return h < 12;
}

export const FESTIVAL_DAY_RANGE_MS: Record<DayKey, { start: number; end: number }> = {
  day_1: {
    start: Date.UTC(2026, 4, 16, 0, 0),
    end: Date.UTC(2026, 4, 16, 12, 30),
  },
  day_2: {
    start: Date.UTC(2026, 4, 17, 0, 0),
    end: Date.UTC(2026, 4, 17, 12, 30),
  },
  day_3: {
    start: Date.UTC(2026, 4, 18, 0, 0),
    end: Date.UTC(2026, 4, 18, 12, 30),
  },
};

export const FESTIVAL_DAY_HOURS = 12.5;

/**
 * PDT calendar dates that map to each festival day. Keyed by the
 * "YYYY-MM-DD" string emitted by `ISO_DATE_FORMATTER` so we can look
 * up "today" without timezone math at the call site.
 */
const FESTIVAL_DATE_TO_DAY: Record<string, DayKey> = {
  "2026-05-15": "day_1",
  "2026-05-16": "day_2",
  "2026-05-17": "day_3",
};

/**
 * If "now" lands on a festival day, return that day's key. Used by
 * the Schedule page to auto-open the matching "My Day" view when a
 * device opens the app on Fri / Sat / Sun of the festival.
 *
 * Resolution order:
 *   1. If `now` is inside a festival day's UTC window
 *      (`FESTIVAL_DAY_RANGE_MS`), return that day. This covers the
 *      late-night hours after midnight when "today's calendar date"
 *      has rolled over but the festival night is still going.
 *   2. Otherwise fall back to the PDT calendar date — so e.g. Friday
 *      afternoon (before gates open) still resolves to Day 1.
 *   3. Anything else returns `null` (off-festival).
 */
export function getCurrentFestivalDay(
  now: number = Date.now(),
): DayKey | null {
  for (const day of DAYS) {
    const r = FESTIVAL_DAY_RANGE_MS[day];
    if (now >= r.start && now <= r.end) return day;
  }
  try {
    const dateStr = ISO_DATE_FORMATTER.format(new Date(now));
    return FESTIVAL_DATE_TO_DAY[dateStr] ?? null;
  } catch {
    return null;
  }
}

export function dayProgress(ms: number, day: DayKey): number {
  const { start, end } = FESTIVAL_DAY_RANGE_MS[day];
  return (ms - start) / (end - start);
}

export function clampToDay(ms: number, day: DayKey): number {
  const { start, end } = FESTIVAL_DAY_RANGE_MS[day];
  return Math.min(end, Math.max(start, ms));
}

export function durationMinutes(startMs: number, endMs: number): number {
  return Math.max(0, Math.round((endMs - startMs) / 60000));
}

export function intersect(
  a: { start: number; end: number },
  b: { start: number; end: number },
): { start: number; end: number } | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  if (start >= end) return null;
  return { start, end };
}

export const BUFFER_MINUTES = 15;
export const BUFFER_MS = BUFFER_MINUTES * 60 * 1000;

/**
 * Maximum allowed gap between two consecutive picks for a "between"
 * buffer to be considered a real transition window. If the gap is
 * larger than this, the user is just skipping that slot (going home,
 * grabbing food, etc.) and we don't surface convergences across it.
 */
export const MAX_BUFFER_GAP_MINUTES = 30;
export const MAX_BUFFER_GAP_MS = MAX_BUFFER_GAP_MINUTES * 60 * 1000;

export function formatRange(startMs: number, endMs: number): string {
  return `${formatTime(startMs)} → ${formatTime(endMs)}`;
}

const ISO_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: LAS_VEGAS_TZ,
});

const ISO_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: LAS_VEGAS_TZ,
});

const PDT_OFFSET_HOURS = 7;

/** Returns "HH:MM" suitable for an <input type="time"> in PDT. */
export function msToTimeInput(ms: number): string {
  if (!isValidMs(ms)) return "00:00";
  return ISO_TIME_FORMATTER.format(new Date(ms));
}

/**
 * Combines an HH:MM string with the calendar day of `anchorMs` (in PDT) and
 * returns the resulting UTC ms. If the resulting ms appears to be far before
 * the anchor (e.g. user picked an early-AM time for a buffer that ends past
 * midnight), the result is rolled forward by 24h to land in the same
 * festival night.
 */
export function applyTimeToAnchor(
  hhmm: string,
  anchorMs: number,
): number {
  const [hStr, mStr] = hhmm.split(":");
  const hour = parseInt(hStr ?? "", 10);
  const minute = parseInt(mStr ?? "", 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return anchorMs;
  const dayString = ISO_DATE_FORMATTER.format(new Date(anchorMs));
  const [y, mo, d] = dayString.split("-").map((p) => parseInt(p, 10));
  let candidate = Date.UTC(y, mo - 1, d, hour + PDT_OFFSET_HOURS, minute, 0);
  if (candidate < anchorMs - 12 * 60 * 60 * 1000) {
    candidate += 24 * 60 * 60 * 1000;
  }
  return candidate;
}

export function clampMs(ms: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, ms));
}
