import { mutation } from "./_generated/server";
import { v } from "convex/values";

type DayKey = "day_1" | "day_2" | "day_3";

interface NormalizedArtist {
  name: string;
  stage: string;
  day: DayKey;
  start: string;
  end: string;
}

const DAY_ANCHORS: Record<DayKey, { y: number; m: number; d: number }> = {
  day_1: { y: 2026, m: 4, d: 15 },
  day_2: { y: 2026, m: 4, d: 16 },
  day_3: { y: 2026, m: 4, d: 17 },
};

const LAS_VEGAS_OFFSET_HOURS = 7;

function parseTimeToMs(
  time: string,
  dayKey: DayKey,
): { ms: number; pastMidnight: boolean } {
  // Accept "8:45pm" and "7pm" (minutes optional).
  const m = time
    .trim()
    .replace(/\s+/g, " ")
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!m) throw new Error(`Bad time: ${time}`);
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3].toLowerCase();
  if (ampm === "pm" && hour !== 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  const pastMidnight = hour < 12;
  const anchor = DAY_ANCHORS[dayKey];
  const dayOffset = pastMidnight ? 1 : 0;
  const ms = Date.UTC(
    anchor.y,
    anchor.m,
    anchor.d + dayOffset,
    hour + LAS_VEGAS_OFFSET_HOURS,
    minute,
    0,
    0,
  );
  return { ms, pastMidnight };
}

function buildArtistRow(raw: NormalizedArtist) {
  const start = parseTimeToMs(raw.start, raw.day);
  const end = parseTimeToMs(raw.end, raw.day);
  let endMs = end.ms;
  if (endMs <= start.ms) {
    endMs += 24 * 60 * 60 * 1000;
  }
  return {
    name: raw.name,
    stage: raw.stage,
    day: raw.day,
    startMs: start.ms,
    endMs,
    crossesMidnight: !start.pastMidnight && end.pastMidnight,
  };
}

// "Day 1" / "day_1" / "1" → "day_1"
function coerceDayKey(input: unknown): DayKey | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const s = String(input).trim().toLowerCase().replace(/\s+/g, "_");
  if (s === "day_1" || s === "day_2" || s === "day_3") return s;
  if (s === "1") return "day_1";
  if (s === "2") return "day_2";
  if (s === "3") return "day_3";
  return null;
}

function splitTimeRange(time: unknown): { start: string; end: string } | null {
  if (typeof time !== "string") return null;
  const parts = time.split(/\s*[–-]\s*/);
  if (parts.length !== 2) return null;
  const [start, end] = parts.map((p) => p.trim());
  if (!start || !end) return null;
  return { start, end };
}

function normalizeFestivalData(data: unknown): NormalizedArtist[] {
  const out: NormalizedArtist[] = [];
  if (!data || typeof data !== "object") return out;
  const obj = data as Record<string, unknown>;

  // New shape: { artists: [{ name, stage, day: "Day 1", time: "8:45pm - 10:15pm" }] }
  if (Array.isArray(obj.artists)) {
    for (const raw of obj.artists as Array<Record<string, unknown>>) {
      const day = coerceDayKey(raw.day);
      const range = splitTimeRange(raw.time);
      const name = typeof raw.name === "string" ? raw.name : null;
      const stage = typeof raw.stage === "string" ? raw.stage : null;
      if (!day || !range || !name || !stage) continue;
      out.push({ name, stage, day, start: range.start, end: range.end });
    }
    return out;
  }

  // Legacy shape: { day_1: [{ artist, stage, start, end }], day_2: [...], day_3: [...] }
  for (const day of ["day_1", "day_2", "day_3"] as const) {
    const list = obj[day];
    if (!Array.isArray(list)) continue;
    for (const raw of list as Array<Record<string, unknown>>) {
      const name = typeof raw.artist === "string" ? raw.artist : null;
      const stage = typeof raw.stage === "string" ? raw.stage : null;
      const start = typeof raw.start === "string" ? raw.start : null;
      const end = typeof raw.end === "string" ? raw.end : null;
      if (!name || !stage || !start || !end) continue;
      out.push({ name, stage, day, start, end });
    }
  }
  return out;
}

export const seedFestival = mutation({
  args: {
    data: v.any(),
  },
  handler: async (ctx, { data }) => {
    const normalized = normalizeFestivalData(data);
    if (normalized.length === 0) {
      throw new Error(
        "seedFestival: no artists could be parsed from the provided JSON. " +
          "Expected either { artists: [...] } or { day_1: [...], ... }.",
      );
    }

    const existing = await ctx.db.query("artists").collect();
    for (const a of existing) await ctx.db.delete(a._id);

    let count = 0;
    for (const raw of normalized) {
      const row = buildArtistRow(raw);
      await ctx.db.insert("artists", row);
      count += 1;
    }
    return { inserted: count };
  },
});

export const clearAllUserData = mutation({
  args: {},
  handler: async (ctx) => {
    for (const name of [
      "notifications",
      "activity",
      "comments",
      "meetups",
      "spots",
      "sidequestParticipants",
      "sidequests",
      "memberSelections",
      "members",
    ] as const) {
      const rows = await ctx.db.query(name).collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
  },
});

interface DemoMember {
  name: string;
  color: string;
}

interface DemoClique {
  cliqueKey: string;
  members: DemoMember[];
}

const CLIQUES: DemoClique[] = [
  {
    cliqueKey: "nick-katrina",
    members: [
      { name: "Nick", color: "#fb7185" },
      { name: "Katrina", color: "#f43f5e" },
    ],
  },
  {
    cliqueKey: "mhar-neriza",
    members: [
      { name: "Mhar", color: "#fb923c" },
      { name: "Neriza", color: "#fbbf24" },
    ],
  },
  {
    cliqueKey: "lillian-percy",
    members: [
      { name: "Lillian", color: "#a3e635" },
      { name: "Percy", color: "#4ade80" },
    ],
  },
  {
    cliqueKey: "lycka-jonathan-ethan",
    members: [
      { name: "Lycka", color: "#14b8a6" },
      { name: "Jonathan", color: "#22d3ee" },
      { name: "Ethan", color: "#06b6d4" },
    ],
  },
  {
    cliqueKey: "brandon-jedd",
    members: [
      { name: "Brandon", color: "#38bdf8" },
      { name: "Jedd", color: "#0ea5e9" },
    ],
  },
  {
    cliqueKey: "reymar-crew",
    members: [
      { name: "Reymar", color: "#8b5cf6" },
      { name: "Anthony", color: "#c084fc" },
      { name: "Chelsea", color: "#d946ef" },
      { name: "Davin", color: "#e879f9" },
      { name: "Vanida", color: "#ec4899" },
    ],
  },
];

/**
 * Hand-scripted itineraries, designed so cliques travel together but
 * split at strategic moments and re-converge on the same next stage.
 *
 * Lookup is case-insensitive against the artists table (festival.json
 * stores names in ALL CAPS), so these can stay in human-readable
 * Title Case. Names should otherwise match festival.json verbatim.
 */
const ITINERARIES: Record<
  string,
  Record<string, string[]>
> = {
  day_1: {
    // Day 1 demo arc — alternating Kinetic Field (KF) and Circuit
    // Grounds (CG) so the destination of every "everyone" slot is the
    // convergence of two distinct origin stages.
    //   11:19pm: split — Sofi Tukker (KF) vs Levity (CG)
    //   12:32am: split — The Chainsmokers (KF) vs Wooli (CG)
    //                    convergences at BOTH (origins KF+CG each)
    //   1:47am:  EVERYONE → Fisher (KF) — convergence
    //   3:01am:  split — Porter Robinson (KF) vs Ray Volpe (CG)
    //   4:30am:  EVERYONE → Level Up (CG) — convergence
    "nick-katrina": [
      "Sofi Tukker",
      "The Chainsmokers",
      "Fisher",
      "Porter Robinson",
      "Level Up",
    ],
    "mhar-neriza": [
      "Sofi Tukker",
      "Wooli",
      "Fisher",
      "Ray Volpe",
      "Level Up",
    ],
    "lillian-percy": [
      "Levity",
      "The Chainsmokers",
      "Fisher",
      "Porter Robinson",
      "Level Up",
    ],
    "lycka-jonathan-ethan": [
      "Levity",
      "Wooli",
      "Fisher",
      "Ray Volpe",
      "Level Up",
    ],
    "brandon-jedd": [
      "Sofi Tukker",
      "Wooli",
      "Fisher",
      "Porter Robinson",
      "Level Up",
    ],
    "reymar-crew": [
      "Levity",
      "The Chainsmokers",
      "Fisher",
      "Ray Volpe",
      "Level Up",
    ],
  },
  day_2: {
    // Day 2 demo arc — six headline slots, each pair producing two
    // convergences (one on KF, one on CG), then a final everyone-on-KF
    // close-out at Above & Beyond.
    //   11:19pm: split — Hardwell (KF) vs Sammy Virji (CG)
    //   12:32am: split — John Summit (KF) vs Tiësto (CG)
    //   1:47am:  split — Subtronics (KF) vs Peggy Gou B2B Ki/Ki (CG)
    //   3:01am:  split — Kaskade (KF) vs Boys Noize (CG)
    //   4:14am:  EVERYONE → Above & Beyond (KF)
    "nick-katrina": [
      "Hardwell",
      "John Summit",
      "Subtronics",
      "Kaskade",
      "Above & Beyond",
    ],
    "mhar-neriza": [
      "Hardwell",
      "Tiësto",
      "Subtronics",
      "Boys Noize",
      "Above & Beyond",
    ],
    "lillian-percy": [
      "Sammy Virji",
      "John Summit",
      "Peggy Gou B2B Ki/Ki",
      "Kaskade",
      "Above & Beyond",
    ],
    "lycka-jonathan-ethan": [
      "Sammy Virji",
      "Tiësto",
      "Peggy Gou B2B Ki/Ki",
      "Boys Noize",
      "Above & Beyond",
    ],
    "brandon-jedd": [
      "Hardwell",
      "Tiësto",
      "Peggy Gou B2B Ki/Ki",
      "Kaskade",
      "Above & Beyond",
    ],
    "reymar-crew": [
      "Sammy Virji",
      "John Summit",
      "Subtronics",
      "Boys Noize",
      "Above & Beyond",
    ],
  },
  day_3: {
    // Day 3 demo arc — KF and CG schedules don't sync as cleanly, so
    // most cliques pick a side for the night. Convergences land at
    // Vintage Culture (CG, mid-late) and Armin Van Buuren (KF, close).
    //   KF path: Griz B2B Wooli → Zedd → Martin Garrix → Cloonee → Armin
    //   CG path: Chris Stussy → Solomun → Vintage Culture → Armin
    "nick-katrina": [
      "Griz B2B Wooli",
      "Zedd",
      "Martin Garrix",
      "Cloonee",
      "Armin Van Buuren",
    ],
    "mhar-neriza": [
      "Griz B2B Wooli",
      "Zedd",
      "Martin Garrix",
      "Vintage Culture",
      "Armin Van Buuren",
    ],
    "lillian-percy": [
      "Chris Stussy",
      "Solomun",
      "Vintage Culture",
      "Armin Van Buuren",
    ],
    "lycka-jonathan-ethan": [
      "Chris Stussy",
      "Solomun",
      "Vintage Culture",
      "Armin Van Buuren",
    ],
    "brandon-jedd": [
      "Griz B2B Wooli",
      "Zedd",
      "Martin Garrix",
      "Cloonee",
      "Armin Van Buuren",
    ],
    "reymar-crew": [
      "Chris Stussy",
      "Solomun",
      "Vintage Culture",
      "Armin Van Buuren",
    ],
  },
};

export const demo = mutation({
  args: {},
  handler: async (ctx) => {
    for (const t of [
      "notifications",
      "activity",
      "comments",
      "meetups",
      "spots",
      "sidequestParticipants",
      "sidequests",
      "memberSelections",
      "members",
    ] as const) {
      const rows = await ctx.db.query(t).collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }

    const allArtists = await ctx.db.query("artists").collect();
    if (allArtists.length === 0) {
      throw new Error("No artists seeded yet. Run seed:seedFestival first.");
    }

    type ArtistId = import("./_generated/dataModel").Id<"artists">;
    // Case-insensitive lookup so the human-friendly Title Case names
    // in ITINERARIES / SCRIPTED_MEETUPS match the (potentially
    // ALL-CAPS) names that come straight out of festival.json.
    const artistByNameDay = new Map<string, ArtistId>();
    for (const a of allArtists) {
      artistByNameDay.set(`${a.day}::${a.name.toLowerCase()}`, a._id);
    }
    function resolveArtistId(
      day: "day_1" | "day_2" | "day_3",
      name: string,
    ): ArtistId | undefined {
      return artistByNameDay.get(`${day}::${name.toLowerCase()}`);
    }

    const now = Date.now();
    type MemberId = import("./_generated/dataModel").Id<"members">;
    let memberOrdinal = 0;
    const insertedMembers: Array<{
      id: MemberId;
      member: DemoMember;
      clique: DemoClique;
    }> = [];
    for (const clique of CLIQUES) {
      for (const member of clique.members) {
        const id = await ctx.db.insert("members", {
          name: member.name,
          nameLower: member.name.toLowerCase(),
          color: member.color.toLowerCase(),
          createdAt: now + memberOrdinal,
        });
        memberOrdinal += 1;
        insertedMembers.push({ id, member, clique });
      }
    }

    let selectionsAdded = 0;
    const missingArtists: string[] = [];
    for (const day of ["day_1", "day_2", "day_3"] as const) {
      const itinerariesForDay = ITINERARIES[day];
      for (const { id, clique } of insertedMembers) {
        const list = itinerariesForDay[clique.cliqueKey] ?? [];
        for (const name of list) {
          const artistId = resolveArtistId(day, name);
          if (!artistId) {
            missingArtists.push(`${day}::${name}`);
            continue;
          }
          await ctx.db.insert("memberSelections", {
            memberId: id,
            artistId,
            addedAt: now + selectionsAdded,
          });
          selectionsAdded += 1;
        }
      }
    }

    // Pre-populate a convergence meetup per day so the demo immediately
    // shows entries on the Meetups tab and inside Coordinate cards.
    const memberByName = new Map<string, MemberId>();
    for (const { id, member } of insertedMembers) {
      memberByName.set(member.name, id);
    }
    const artistByDayName = new Map<string, typeof allArtists[number]>();
    for (const a of allArtists) {
      artistByDayName.set(`${a.day}::${a.name.toLowerCase()}`, a);
    }
    function resolveArtist(
      day: "day_1" | "day_2" | "day_3",
      name: string,
    ): typeof allArtists[number] | undefined {
      return artistByDayName.get(`${day}::${name.toLowerCase()}`);
    }

    const BUFFER_MS = 15 * 60 * 1000;
    /**
     * Scripted meetups, now keyed by (day, window, destinationStage)
     * to match the convergence-pinned model. The from-artists are only
     * used to compute the convergence window — the meetup itself isn't
     * tied to any specific members.
     */
    const SCRIPTED_MEETUPS: Array<{
      day: "day_1" | "day_2" | "day_3";
      fromArtists: string[];
      sharedToArtist: string;
      label: string;
    }> = [
      {
        day: "day_1",
        fromArtists: ["Sofi Tukker", "Levity"],
        sharedToArtist: "The Chainsmokers",
        label: "Electric Avenue Sign",
      },
      {
        day: "day_1",
        fromArtists: ["The Chainsmokers", "Wooli"],
        sharedToArtist: "Fisher",
        label: "Kinetic Field Entrance",
      },
      {
        day: "day_1",
        fromArtists: ["Porter Robinson", "Ray Volpe"],
        sharedToArtist: "Level Up",
        label: "Basspod GA Bathrooms",
      },
      {
        day: "day_2",
        fromArtists: ["Hardwell", "Sammy Virji"],
        sharedToArtist: "John Summit",
        label: "Electric Avenue Sign",
      },
      {
        day: "day_2",
        fromArtists: ["Kaskade", "Boys Noize"],
        sharedToArtist: "Above & Beyond",
        label: "Kinetic Field Entrance",
      },
      {
        day: "day_3",
        fromArtists: ["Cloonee", "Vintage Culture"],
        sharedToArtist: "Armin Van Buuren",
        label: "Electric Avenue Sign",
      },
    ];

    let meetupsAdded = 0;
    for (const m of SCRIPTED_MEETUPS) {
      const froms = m.fromArtists
        .map((name) => resolveArtist(m.day, name))
        .filter((a): a is NonNullable<typeof a> => Boolean(a));
      const shared = resolveArtist(m.day, m.sharedToArtist);
      if (froms.length < 2 || !shared) continue;

      const windowStartMs =
        Math.max(...froms.map((a) => a.endMs)) - BUFFER_MS;
      const windowEndMs = shared.startMs + BUFFER_MS;
      if (windowEndMs <= windowStartMs) continue;

      await ctx.db.insert("meetups", {
        day: m.day,
        windowStartMs,
        windowEndMs,
        destinationStage: shared.stage,
        label: m.label,
        editedAt: now + selectionsAdded + meetupsAdded,
      });
      meetupsAdded += 1;
    }

    return {
      cliques: CLIQUES.length,
      members: insertedMembers.length,
      selectionsAdded,
      meetupsAdded,
      missingArtists: Array.from(new Set(missingArtists)),
    };
  },
});
