export const STAGE_NAMES = [
  // Main stages first — DesktopGrid renders columns in this
  // order, so primary stages should lead the layout.
  "Kinetic Field",
  "Circuit Grounds",
  "Cosmic Meadow",
  "Basspod",
  "Neon Garden",
  "Quantum Valley",
  "Stereobloom",
  "Wasteland",
  "Bionic Jungle",
  // Secondary stages, art cars, and partner activations.
  // These all have full lineups in festival.json — listing
  // them here is what makes them appear in the dropdown
  // picker, the desktop grid, and "Where to next?" suggestions.
  "Forest House",
  "Casa Bacardi",
  "Insomniac Fridays",
  "YeeDC",
  "Takis Rave Hangar",
  "Electrolit Hydration House",
  "Beatbox Art Car",
  "Picnic Playtime Art Car",
] as const;

export type StageName = (typeof STAGE_NAMES)[number];

export interface StagePalette {
  hue: string;
  bg: string;
  bgSoft: string;
  border: string;
  text: string;
  ring: string;
  dot: string;
  rgb: string;
}

const STAGE_HUES: Record<string, string> = {
  "Kinetic Field": "rose",
  "Circuit Grounds": "amber",
  "Cosmic Meadow": "lime",
  Basspod: "violet",
  "Neon Garden": "emerald",
  "Quantum Valley": "sky",
  Stereobloom: "fuchsia",
  Wasteland: "orange",
  "Bionic Jungle": "teal",
  "Forest House": "green",
  "Casa Bacardi": "blue",
  "Insomniac Fridays": "purple",
  YeeDC: "indigo",
  "Takis Rave Hangar": "red",
  "Electrolit Hydration House": "cyan",
  "Beatbox Art Car": "pink",
  "Picnic Playtime Art Car": "yellow",
};

const STAGE_RGB: Record<string, string> = {
  "Kinetic Field": "244 63 94",
  "Circuit Grounds": "245 158 11",
  "Cosmic Meadow": "132 204 22",
  Basspod: "139 92 246",
  "Neon Garden": "16 185 129",
  "Quantum Valley": "14 165 233",
  Stereobloom: "217 70 239",
  Wasteland: "249 115 22",
  "Bionic Jungle": "20 184 166",
  "Forest House": "34 197 94",
  "Casa Bacardi": "96 165 250",
  "Insomniac Fridays": "168 85 247",
  YeeDC: "129 140 248",
  "Takis Rave Hangar": "239 68 68",
  "Electrolit Hydration House": "34 211 238",
  "Beatbox Art Car": "236 72 153",
  "Picnic Playtime Art Car": "234 179 8",
};

export function getStagePalette(stage: string): StagePalette {
  const hue = STAGE_HUES[stage] ?? "zinc";
  const rgb = STAGE_RGB[stage] ?? "115 115 115";
  return {
    hue,
    bg: `bg-${hue}-500/15`,
    bgSoft: `bg-${hue}-500/8`,
    border: `border-${hue}-500/40`,
    text: `text-${hue}-300`,
    ring: `ring-${hue}-500/50`,
    dot: `bg-${hue}-500`,
    rgb,
  };
}

export const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  STAGE_NAMES.map((s, i) => [s, i]),
);

export const MEMBER_PALETTE = [
  { name: "Coral", value: "#fb7185" },
  { name: "Crimson", value: "#f43f5e" },
  { name: "Salmon", value: "#f87171" },
  { name: "Vermillion", value: "#f97316" },
  { name: "Tangerine", value: "#fb923c" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Honey", value: "#fbbf24" },
  { name: "Mustard", value: "#facc15" },
  { name: "Citrine", value: "#eab308" },
  { name: "Lime", value: "#a3e635" },
  { name: "Pear", value: "#84cc16" },
  { name: "Spring", value: "#4ade80" },
  { name: "Emerald", value: "#22c55e" },
  { name: "Mint", value: "#34d399" },
  { name: "Forest", value: "#10b981" },
  { name: "Teal", value: "#2dd4bf" },
  { name: "Sea", value: "#14b8a6" },
  { name: "Cyan", value: "#22d3ee" },
  { name: "Lagoon", value: "#06b6d4" },
  { name: "Sky", value: "#38bdf8" },
  { name: "Azure", value: "#0ea5e9" },
  { name: "Cobalt", value: "#3b82f6" },
  { name: "Iris", value: "#6366f1" },
  { name: "Indigo", value: "#818cf8" },
  { name: "Lavender", value: "#a78bfa" },
  { name: "Plum", value: "#8b5cf6" },
  { name: "Lilac", value: "#c084fc" },
  { name: "Orchid", value: "#d946ef" },
  { name: "Fuchsia", value: "#e879f9" },
  { name: "Magenta", value: "#ec4899" },
] as const;

export const GROUP_PALETTE = [
  { name: "Sunset", value: "#f43f5e" },
  { name: "Honey", value: "#facc15" },
  { name: "Mint", value: "#34d399" },
  { name: "Lagoon", value: "#06b6d4" },
  { name: "Midnight", value: "#6366f1" },
  { name: "Lilac", value: "#c084fc" },
  { name: "Bubblegum", value: "#ec4899" },
  { name: "Tangerine", value: "#f97316" },
  { name: "Sea", value: "#14b8a6" },
  { name: "Forest", value: "#22c55e" },
  { name: "Cobalt", value: "#3b82f6" },
  { name: "Plum", value: "#a855f7" },
] as const;

export function pickColorForIndex<T extends { value: string }>(
  palette: ReadonlyArray<T>,
  index: number,
): string {
  return palette[index % palette.length].value;
}

export function nextAvailableColor<T extends { value: string }>(
  palette: ReadonlyArray<T>,
  taken: ReadonlyArray<string>,
): string {
  const set = new Set(taken.map((c) => c.toLowerCase()));
  for (const c of palette) {
    if (!set.has(c.value.toLowerCase())) return c.value;
  }
  return palette[Math.floor(Math.random() * palette.length)].value;
}

export function readableTextColor(hex: string): string {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return "#000000";
  const [r, g, b] = m.map((h) => parseInt(h, 16) / 255);
  const lum =
    0.2126 * (r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)) +
    0.7152 * (g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)) +
    0.0722 * (b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4));
  return lum > 0.5 ? "#0a0a0a" : "#ffffff";
}
