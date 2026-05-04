# Operations: local dev, seeds, and Convex MCP

Quick reference for working with the three Convex environments, refreshing
seed data, and using the Convex MCP from inside Cursor.

If you just want the answer to "how do I…", jump to the recipe in the
matching section.

---

## Environments at a glance


| Env            | Branch    | Vercel URL                                                                                             | Convex project           | Convex deployment               | Seed source                                             |
| -------------- | --------- | ------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------- | ------------------------------------------------------- |
| **Local dev**  | (any)     | `npm run dev`                                                                                          | `learnos/edc-30`         | `dev:energized-grasshopper-849` | `seed:demo` (manual)                                    |
| **Staging**    | `staging` | [https://edc-30-git-staging-school-hero.vercel.app](https://edc-30-git-staging-school-hero.vercel.app) | `learnos/edc-30-staging` | `prod:abundant-lemming-5`       | `seeds/dev-snapshot.zip` (auto, every deploy)           |
| **Production** | `main`    | [https://edc-30.vercel.app](https://edc-30.vercel.app)                                                 | `learnos/edc-30`         | `prod:rightful-setter-783`      | `seed:seedFestival` with `festival.json` (manual, once) |


Key facts:

- **Local dev** uses the dev deployment. `npx convex dev` keeps it in sync
with `convex/*.ts` while you code.
- **Staging** auto-resets to the dev snapshot on every push to `staging`
(the build hook calls `npx convex import --replace-all -y seeds/dev-snapshot.zip`).
- **Production** is *never* auto-seeded by the build. The artist lineup is
loaded once from `festival.json`; user-generated data accumulates and is
not touched by deploys.

---

## Local dev

### First-time setup

```bash
npm install
npx convex dev          # one-time; opens a browser to log in to Convex.
                        # leave it running for hot pushes during dev.
npm run dev             # Vite on http://localhost:5173 in another terminal
```

`.env.local` should already point at `dev:energized-grasshopper-849`.

### Re-seed your local dev deployment

The `demo` mutation wipes user data and re-inserts cliques, selections, and
scripted meetups so the app always boots into a populated state:

```bash
npx convex run seed:demo '{}'
# → { cliques: 6, members: 16, selectionsAdded: 372, meetupsAdded: 3, missingArtists: [] }
```

Wipe everything except the artist table:

```bash
npx convex run seed:clearAllUserData '{}'
```

(Re-seed the artists table from `festival.json` — only do this if `artists`
has gotten out of sync with the festival data file:)

```bash
ARGS=$(node -e "console.log(JSON.stringify({data: require('./festival.json')}))")
npx convex run seed:seedFestival "$ARGS"
```

### Refresh `seeds/dev-snapshot.zip`

After making interesting changes to your dev workspace (extra picks,
member tweaks, etc.), commit a fresh snapshot so the next staging deploy
picks it up:

```bash
rm seeds/dev-snapshot.zip
npm run snapshot:dev
git add seeds/dev-snapshot.zip
git commit -m "chore: refresh staging snapshot"
git push                 # if on staging, triggers auto-import
```

The snapshot is a Convex export ZIP with one folder per table containing
`documents.jsonl`. ~30 KB at current sizes.

---

## Staging seed flow

### How it works

`scripts/vercel-build.mjs` runs on every push to `staging`:

1. `npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL`
  pushes the schema + functions to the staging deployment, with
   `VITE_CONVEX_URL` set so the Vite build embeds the staging Convex URL.
2. Then: `npx convex import --replace-all -y seeds/dev-snapshot.zip`
  wipes every table and replaces it with the snapshot's contents.

So **what's in the snapshot is what staging shows**, every deploy.

### Updating the staging seed

Same workflow as the local snapshot refresh above, but make sure your
**dev** deployment is the source of truth first:

```bash
# 1. Get your local dev into the state you want staging to mirror.
npx convex run seed:demo '{}'                # or hand-curate

# 2. Export it.
rm seeds/dev-snapshot.zip
npm run snapshot:dev

# 3. Commit + push to staging branch.
git checkout staging
git add seeds/dev-snapshot.zip
git commit -m "chore: refresh staging snapshot"
git push origin staging                       # triggers Vercel build → reseed
```

### Re-seed staging right now (without redeploying)

If you don't want to bump a commit:

```bash
CONVEX_DEPLOY_KEY='prod:abundant-lemming-5|<token>' \
  npx convex import --replace-all -y seeds/dev-snapshot.zip
```

The token is the value stored in Vercel as `CONVEX_DEPLOY_KEY` for the
Preview/staging environment.

### Wipe staging when a schema change collides with old rows

If a schema migration breaks because old-shape rows exist:

```bash
CONVEX_DEPLOY_KEY='prod:abundant-lemming-5|<token>' \
  npx convex run seed:clearAllUserData '{}'
```

Then push staging again — the build's snapshot import recreates everything
on the new schema.

---

## Production seed flow

### What's NOT in the production deploy

Production deploys (push to `main`) **only push schema + functions and
build the Vite app**. They do not touch Convex data. This is intentional:
production data is user-owned and persistent.

### Loading the festival lineup (one-time, then occasional updates)

```bash
ARGS=$(node -e "console.log(JSON.stringify({data: require('./festival.json')}))")
CONVEX_DEPLOY_KEY='prod:rightful-setter-783|<token>' \
  npx convex run seed:seedFestival "$ARGS"
# → { inserted: 245 }
```

`seedFestival` clears and re-inserts the `artists` table. It does **not**
touch members, selections, or meetups, so it's safe to re-run if the
festival lineup changes.

### Wiping production user data (emergency reset only)

```bash
CONVEX_DEPLOY_KEY='prod:rightful-setter-783|<token>' \
  npx convex run seed:clearAllUserData '{}'
```

This wipes `meetups`, `memberSelections`, `members`, and `sidequests`. Use
extreme caution — there's no undo.

---

## Convex MCP (in Cursor)

The Convex MCP lets the agent (and you, via the chat UI) interact with any
of the three Convex deployments without leaving the editor. Available
tools live under `~/.cursor/projects/<workspace>/mcps/user-convex/tools/`.

### What's available


| Tool                                          | What it does                                                 |
| --------------------------------------------- | ------------------------------------------------------------ |
| `status`                                      | List the deployments associated with the current project dir |
| `tables`                                      | List tables in a deployment                                  |
| `data`                                        | Read rows from a table (paginated)                           |
| `runOneoffQuery`                              | Run an inline query function against a deployment            |
| `run`                                         | Call any deployed query/mutation by name                     |
| `functionSpec`                                | Inspect a deployed function's signature                      |
| `logs`                                        | Tail recent function-call logs                               |
| `insights`                                    | Health / performance insights for a deployment               |
| `envGet` / `envList` / `envSet` / `envRemove` | Manage Convex env vars                                       |


### Important: deployment selectors

Most tools take a `deploymentSelector` (or `projectDir`). For this repo:

- **Dev**: pass `projectDir` only — the MCP will pick the dev deployment
by default.
- **Production**: use the `prod` selector. The MCP marks production
deployments as `readOnly: true` by default — only `tables`, `insights`,
and `functionSpec` work without an extra opt-in flag. Use
`--cautiously-allow-production-pii` (in tool args) to allow `data`,
`logs`, `runOneoffQuery` reads. Use `--dangerously-enable-production-deployments`
to allow mutations.
- **Staging**: it's a separate Convex *project*, so the dev project's
`status` won't list it. Target it via its deployment name
(`abundant-lemming-5`) or via the cross-project syntax
`learnos:edc-30-staging:prod` when calling `npx convex` from the CLI.

### Common MCP recipes

**See what's in dev right now**

Ask the agent:

> Use the Convex MCP to list members in dev.

The agent will call `tables` and then `data` for the `members` table.

**Run a one-off query against dev**

> Use Convex MCP `runOneoffQuery` to count meetups in dev.

```ts
// Inline query the agent will pass:
export default async function ({ db }) {
  return (await db.query("meetups").collect()).length;
}
```

**Re-seed dev via the MCP**

> Use Convex MCP `run` to call `seed:demo` on dev.

(Equivalent to `npx convex run seed:demo '{}'`.)

**Manage Convex env vars (e.g. add `OPENAI_API_KEY` to dev)**

> Use Convex MCP `envSet` to set OPENAI_API_KEY on dev to "sk-...".

The MCP refuses production mutations unless explicitly opted in.

### Things the Convex MCP cannot do

- **Create projects or deployments**. New Convex projects must be created
via `npx convex dev --once --configure new --team learnos --project <name>`.
- **Generate deploy keys for projects it doesn't have read access to**.
Use `npx convex deployment token create <name> --deployment <selector>`.
- **Wipe entire tables in one call** — use `clearAllUserData` (or write
a one-off mutation if you need finer scope).

---

## Schema migrations and recovery

Adding optional fields, new tables, or new indexes is **backward-compatible**
and deploys cleanly. Removing or making fields required when existing rows
don't satisfy the new shape will break the schema push.

### When a deploy fails with `Schema validation failed`

1. Identify the offending table from the build log.
2. Wipe the relevant rows on the failing deployment:
  ```bash
   CONVEX_DEPLOY_KEY='<deploy-key>' \
     npx convex run seed:clearAllUserData '{}'
  ```
   This is safe on staging (it'll re-import from the snapshot on next
   push) and on dev (you can re-run `seed:demo`).
   On **production**, decide first whether you really want to wipe
   user-generated data — or write a custom migration mutation that
   patches old rows in place before the schema push.
3. Re-run the deploy (push an empty commit if needed):
  ```bash
   git commit --allow-empty -m "chore: retrigger deploy"
   git push
  ```

---

## Deploy keys

Tokens are one secret per environment, stored only as `CONVEX_DEPLOY_KEY`
in Vercel and (occasionally) inline in shell commands. They are not in
the repo and not in `.env.local`.


| Token                          | Targets           | Stored as                                                  |
| ------------------------------ | ----------------- | ---------------------------------------------------------- |
| `prod:rightful-setter-783|...` | Production Convex | Vercel `CONVEX_DEPLOY_KEY` (Production scope)              |
| `prod:abundant-lemming-5|...`  | Staging Convex    | Vercel `CONVEX_DEPLOY_KEY` (Preview scope, branch=staging) |


### Rotate a token

```bash
# Generate a new one
npx convex deployment token create vercel-prod-v2 \
  --deployment learnos:edc-30:prod          # or :staging:prod for staging

# Save the new value to Vercel (overwriting the old one)
echo 'prod:...|...' | vercel env rm CONVEX_DEPLOY_KEY production -y
echo 'prod:...|...' | vercel env add CONVEX_DEPLOY_KEY production

# (Optional) Revoke the old one in the Convex dashboard
```

---

## Quick recipe index


| I want to…                                         | Recipe                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Spin up local dev                                  | `npx convex dev` + `npm run dev`                                                |
| Re-seed local with demo cliques                    | `npx convex run seed:demo '{}'`                                                 |
| Refresh the staging snapshot                       | `npm run snapshot:dev` → commit → push staging                                  |
| Reset staging right now (no commit)                | `CONVEX_DEPLOY_KEY=… npx convex import --replace-all -y seeds/dev-snapshot.zip` |
| Reload the production festival lineup              | `seedFestival` with `festival.json` (see Production section)                    |
| Wipe production user data                          | `CONVEX_DEPLOY_KEY=… npx convex run seed:clearAllUserData '{}'` ⚠               |
| Inspect a Convex deployment                        | Convex MCP `tables` + `data`                                                    |
| Run a one-off query                                | Convex MCP `runOneoffQuery`                                                     |
| Tail logs                                          | Convex MCP `logs`                                                               |
| Recover from `Schema validation failed` on staging | Wipe via `clearAllUserData`, push again                                         |


