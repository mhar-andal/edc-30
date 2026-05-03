# EDC Schedule

A Vite + React + TypeScript PWA for **EDC Las Vegas (May 15–17, 2026)** that helps a group of festival friends coordinate which artists they'll see and find buffer-window meetups between groups.

## Concept

- One **shared, fully public workspace** — no accounts, no passwords. Anyone who opens the app sees every member, every group, and every pick.
- A **member** is a person on a single device. Identity (`memberId + memberName`) is stored in `localStorage`.
- A **group** has exactly one leader (its creator). The leader picks the group's artist itinerary; joiners follow it read-only.
- A member can be in multiple groups (one or more as leader, others as joiner).
- The **Coordinate** view computes 30-minute buffer windows around every consecutive pair of selected sets (`set.end − 15min` → `nextSet.start + 15min`) and surfaces every overlap between two groups' buffer windows as a "convergence opportunity" with an editable meetup (stage + freeform note).
- Meetups are editable by anyone — last-write-wins.

> Trade-off: zero privacy. This is a shared festival board; do not put anything sensitive in it.

## Tech stack

- Vite 6 · React 19 · TypeScript
- React Router 7
- Tailwind v4 + shadcn-style primitives + Radix UI
- Convex (queries / mutations / real-time WebSocket sync)
- vite-plugin-pwa (Workbox) for service worker + offline app shell
- idb-keyval for a thin per-query disk cache so previously-seen data is available offline
- date-fns for time math

## Repository layout

```
edc-30/
  festival.json                  Source of truth for the seeder
  convex/
    schema.ts                    Tables: members, groups, groupMemberships, artists, groupSelections, meetups
    members.ts                   create / list / rename / setColor / remove
    groups.ts                    create / rename / setColor / remove (leader-only) / join / leave
    groupSelections.ts           toggle (leader-only) / listAll / listForGroup
    meetups.ts                   upsert / clear / listForDay / listAll
    artists.ts                   listAll
    seed.ts                      seedFestival (idempotent: clears + re-inserts) + clearAllUserData
  src/
    main.tsx                     ConvexProvider + PWA SW registration
    App.tsx                      Router (lazy-loaded routes + RequireSession guard)
    routes/
      Onboarding.tsx             Pick name + color → create OR join groups
      Schedule.tsx               Day tabs · group filter · default grid / single-column / compare-view
      People.tsx                 Members + Groups, edit-your-own + leader-gated controls
      Coordinate.tsx             Timeline · convergence cards · saved meetups
    components/
      schedule/
        DesktopGrid.tsx          Default desktop time-by-stage grid
        MobileStageList.tsx      Default mobile per-stage list
        CompareView.tsx          Side-by-side group columns (active when 1+ groups filtered)
        ArtistCard.tsx           Stage-color card with group chips, leader-toggleable
      coordinate/
        Timeline.tsx             Per-group horizontal timeline with buffer bands
        ConvergenceCard.tsx      Group-pair convergence row + MeetupEditor
        MeetupEditor.tsx         Stage chip + freeform note + edited-by + suggested-stage one-tap
        SavedMeetups.tsx         Orphaned meetups (window no longer matches a live convergence)
      people/
        CreateGroupDialog.tsx    Inline create-group from /people
      filters/GroupFilter.tsx
      ColorPicker.tsx
      GroupChip.tsx · MemberDot.tsx · DayBadge.tsx · OfflineBadge.tsx · AppShell.tsx
      ui/...                     shadcn-style primitives (Button, Dialog, Tabs, Popover, Select, ...)
    lib/
      time.ts                    Day anchors, hour formatting, intersect helper
      colors.ts                  Stage palette · member palette · group palette · readableTextColor
      coordinate.ts              buildJourney · findConvergences · suggestMeetupStage · meetupKey
      offlineCache.ts            idb-keyval wrapper
      useCachedQuery.ts          useQuery wrapper that hydrates from disk + persists each result
      useScheduleData.ts         Combined cached query for artists/members/groups/selections
      useMemberSession.ts        localStorage { memberId, memberName }
      utils.ts                   cn(...)
    pwa/register-sw.ts
  public/
    favicon.svg
    icons/icon.svg · icons/icon-maskable.svg
  vite.config.ts                 Vite + Tailwind v4 + VitePWA (Convex URLs excluded from cache)
```

## Getting started

```bash
npm install
npx convex dev      # one-time: creates deployment, writes .env.local. Leave running for hot pushes.
npm run dev         # starts Vite on http://localhost:5173
```

If `.env.local` doesn't yet exist, the first `npx convex dev` opens a browser to log into Convex, prompts for a project name (default: folder name), and creates a dev deployment. After that, the watcher hot-pushes `convex/*.ts` changes.

## Seeding the festival data

```bash
node -e "console.log(JSON.stringify({data: require('./festival.json')}))" \
  | xargs -I{} npx convex run seed:seedFestival '{}'
```

Or, equivalently, in one shot:

```bash
ARGS=$(node -e "console.log(JSON.stringify({data: require('./festival.json')}))") \
  && npx convex run seed:seedFestival "$ARGS"
```

The seeder is idempotent (clears the `artists` table, then re-inserts). Days anchor to 2026-05-15 / 16 / 17 in `America/Los_Angeles`; times before noon belong to the previous evening's festival day. To wipe user-generated data without touching artists:

```bash
npx convex run seed:clearAllUserData '{}'
```

## Permissions model (server-enforced)

| Action | Who can do it |
| --- | --- |
| Create a group | Anyone (you become its leader) |
| Rename / recolor / delete a group | Leader only |
| Toggle the group's artist picks | Leader only |
| Join / leave a group | Any member (leader can't leave their own group — delete it instead) |
| Edit / clear any meetup | Anyone |
| Rename / recolor / delete your own member | You only |

Mutations take a `memberId` arg from the client; the server validates `group.leaderMemberId === memberId` for leader-only operations.

## Offline behavior

- The PWA service worker (Workbox) precaches the app shell + all static assets. Visit the app once online and it'll boot offline thereafter (`registerType: 'autoUpdate'`).
- Convex URLs (`*.convex.cloud`) are explicitly **never** cached — they always go to the network when online.
- `useCachedQuery` writes every query result into IndexedDB (via `idb-keyval`) keyed by `(functionName, args)` and hydrates from it synchronously on cold start, so the schedule + coordinate views render immediately offline with last-known data.
- Mutations rely on Convex's built-in queue: while offline, calls are buffered and replayed on reconnect.
- An `OfflineBadge` in the header surfaces when the WebSocket isn't connected.

## Deploying

The project is a static SPA backed by Convex. To deploy the frontend (e.g. on Vercel):

1. `npx convex deploy` — promotes the dev deployment's code to your prod deployment and prints the prod URL.
2. Build settings:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Env vars: `VITE_CONVEX_URL` set to the prod Convex URL.

## Replacing the placeholder icons

The PWA ships with simple SVG icons in `public/icons/`. To customise, replace `icon.svg` (any/maskable) and update `vite.config.ts` if you want PNG variants or additional sizes.
