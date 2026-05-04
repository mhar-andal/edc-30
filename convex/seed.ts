import { mutation } from "./_generated/server";
import { v } from "convex/values";

type DayKey = "day_1" | "day_2" | "day_3";

interface RawArtist {
  artist: string;
  stage: string;
  start: string;
  end: string;
}

interface FestivalJson {
  day_1: RawArtist[];
  day_2: RawArtist[];
  day_3: RawArtist[];
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
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) throw new Error(`Bad time: ${time}`);
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
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

function buildArtistRow(raw: RawArtist, dayKey: DayKey) {
  const start = parseTimeToMs(raw.start, dayKey);
  const end = parseTimeToMs(raw.end, dayKey);
  let endMs = end.ms;
  if (endMs <= start.ms) {
    endMs += 24 * 60 * 60 * 1000;
  }
  return {
    name: raw.artist,
    stage: raw.stage,
    day: dayKey,
    startMs: start.ms,
    endMs,
    crossesMidnight: !start.pastMidnight && end.pastMidnight,
  };
}

export const seedFestival = mutation({
  args: {
    data: v.any(),
  },
  handler: async (ctx, { data }) => {
    const json = data as FestivalJson;
    const existing = await ctx.db.query("artists").collect();
    for (const a of existing) await ctx.db.delete(a._id);

    let count = 0;
    for (const day of ["day_1", "day_2", "day_3"] as const) {
      const list = json[day];
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const row = buildArtistRow(raw, day);
        await ctx.db.insert("artists", row);
        count += 1;
      }
    }
    return { inserted: count };
  },
});

export const clearAllUserData = mutation({
  args: {},
  handler: async (ctx) => {
    for (const name of [
      "meetups",
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
 * split at strategic moments and reconverge on the same next stage.
 * These artist names must match festival.json exactly.
 */
const ITINERARIES: Record<
  string,
  Record<string, string[]>
> = {
  day_1: {
    // Day 1 demo arc
    //  - 7pm: cliques settle into their preferred areas (split across stages)
    //  - 11:19pm: half see Sofi Tukker (Kinetic), half see Levity (Circuit)
    //  - 12:25am: EVERYONE converges on Wooli (Circuit) — different from-stage,
    //    same to-stage convergence opportunity.
    //  - 1:47am: split again — half stay for Fisher (Kinetic), half catch
    //    The Outlaw → Holy Priest at Circuit; reconverge on Porter Robinson at
    //    Kinetic 3:01am.
    "nick-katrina": [
      "Laidback Luke B2B",
      "Argy",
      "Chris Lorenzo",
      "Sofi Tukker",
      "Wooli",
      "Fisher",
      "Porter Robinson",
    ],
    "mhar-neriza": [
      "Riot",
      "Heyz",
      "Muzz",
      "Sofi Tukker",
      "Wooli",
      "Fisher",
      "Adventure Club",
      "Porter Robinson",
    ],
    "lillian-percy": [
      "Jackie Hollander",
      "Roddy Lima",
      "Westend",
      "Walker & Royce B2B",
      "Levity",
      "Wooli",
      "MPH",
      "Porter Robinson",
    ],
    "lycka-jonathan-ethan": [
      "Anastazja",
      "Mestiza",
      "DJ Tennis B2B Chloe Caillet",
      "Levity",
      "Wooli",
      "Joseph Capriati",
      "Porter Robinson",
    ],
    "brandon-jedd": [
      "Sarah De Warren",
      "Cold Blue",
      "Cosmic Gate",
      "Levity",
      "Wooli",
      "Ilan Bluestone",
      "Porter Robinson",
    ],
    "reymar-crew": [
      "Laidback Luke B2B",
      "Korolova",
      "Argy",
      "Chris Lorenzo",
      "Sofi Tukker",
      "Wooli",
      "Fisher",
      "Porter Robinson",
    ],
  },
  day_2: {
    // Day 2 demo arc
    //  - 11:19pm: half see Hardwell (Kinetic), half see Sammy Virji (Circuit)
    //  - 12:15am: EVERYONE converges on Tiësto (Circuit) — different from-stages
    //  - 3am: split into Kaskade (Kinetic) vs Boys Noize (Circuit)
    //  - 4:14am: reconverge on Above & Beyond at Kinetic
    "nick-katrina": [
      "Hayla",
      "Sub Focus",
      "Steve Aoki",
      "Hardwell",
      "Tiësto",
      "Kaskade",
      "Above & Beyond",
    ],
    "mhar-neriza": [
      "Fallen With",
      "Avello B2B",
      "Hybrid Minds",
      "Hardwell",
      "Tiësto",
      "Eptic B2B Space Laces",
      "Kaskade",
      "Above & Beyond",
    ],
    "lillian-percy": [
      "Frost Children",
      "Hannah Laing",
      "Snow",
      "Sammy Virji",
      "Tiësto",
      "Boys Noize",
      "Above & Beyond",
    ],
    "lycka-jonathan-ethan": [
      "Mink",
      "Silvie Loto",
      "Ahmed Spins",
      "Sammy Virji",
      "Tiësto",
      "Prospa",
      "Above & Beyond",
    ],
    "brandon-jedd": [
      "Maria Healy",
      "Superstrings",
      "Billy Gillies",
      "Paul Oakenfold",
      "Sammy Virji",
      "Tiësto",
      "Above & Beyond",
    ],
    "reymar-crew": [
      "AR/CO",
      "Hayla",
      "Sub Focus",
      "Steve Aoki",
      "Hardwell",
      "Tiësto",
      "Kaskade",
      "Above & Beyond",
    ],
  },
  day_3: {
    // Day 3 demo arc
    //  - 12:32am: half see Zedd (Kinetic), half see Solomun (Circuit)
    //  - 1:47am: EVERYONE converges on Martin Garrix (Kinetic) — Solomun crew
    //    crosses from Circuit, Zedd crew continues on Kinetic
    //  - 4:14am: everyone closes out on Armin Van Buuren at Kinetic
    "nick-katrina": [
      "Trace",
      "Ship Wrek",
      "Layton Giordani",
      "Funk Tribu",
      "Griz B2B Wooli",
      "Zedd",
      "Martin Garrix",
      "Armin Van Buuren",
    ],
    "mhar-neriza": [
      "Nightstalker",
      "Sippy",
      "Eazybaked",
      "Infekt B2B Samplifire",
      "Virtual Riot",
      "Peekaboo",
      "Zedd",
      "Martin Garrix",
      "Armin Van Buuren",
    ],
    "lillian-percy": [
      "Gravagerz",
      "Nostalgix",
      "William Black",
      "San Holo",
      "Dabin",
      "Solomun",
      "Martin Garrix",
      "Armin Van Buuren",
    ],
    "lycka-jonathan-ethan": [
      "Bad Beat",
      "Frankie Bones",
      "Adiel",
      "DJ Gigola",
      "Solomun",
      "Martin Garrix",
      "999999999",
      "Armin Van Buuren",
    ],
    "brandon-jedd": [
      "Warung",
      "Shingo Nakamura",
      "Rebuke",
      "Cristoph",
      "Eli & Fur",
      "Tinlicker",
      "Solomun",
      "Martin Garrix",
      "Armin Van Buuren",
    ],
    "reymar-crew": [
      "Trace",
      "Ship Wrek",
      "Layton Giordani",
      "Funk Tribu",
      "Griz B2B Wooli",
      "Zedd",
      "Martin Garrix",
      "Armin Van Buuren",
    ],
  },
};

export const demo = mutation({
  args: {},
  handler: async (ctx) => {
    for (const t of [
      "meetups",
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
    const artistByNameDay = new Map<string, ArtistId>();
    for (const a of allArtists) {
      artistByNameDay.set(`${a.day}::${a.name}`, a._id);
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
          const artistId = artistByNameDay.get(`${day}::${name}`);
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
    for (const a of allArtists) artistByDayName.set(`${a.day}::${a.name}`, a);

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
        sharedToArtist: "Wooli",
        label: "Electric Avenue Sign",
      },
      {
        day: "day_2",
        fromArtists: ["Hardwell", "Sammy Virji"],
        sharedToArtist: "Tiësto",
        label: "Electric Avenue Sign",
      },
      {
        day: "day_3",
        fromArtists: ["Dabin", "DJ Gigola"],
        sharedToArtist: "Solomun",
        label: "Electric Avenue Sign",
      },
    ];

    let meetupsAdded = 0;
    for (const m of SCRIPTED_MEETUPS) {
      const froms = m.fromArtists
        .map((name) => artistByDayName.get(`${m.day}::${name}`))
        .filter((a): a is NonNullable<typeof a> => Boolean(a));
      const shared = artistByDayName.get(`${m.day}::${m.sharedToArtist}`);
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
