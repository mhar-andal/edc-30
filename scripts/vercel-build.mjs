#!/usr/bin/env node
/**
 * Vercel build entrypoint.
 *
 * Steps:
 * 1. Push the latest Convex schema/functions to whichever deployment
 *    CONVEX_DEPLOY_KEY points at, then run `npm run build` with
 *    VITE_CONVEX_URL set to that deployment's URL.
 * 2. If this is the staging branch, reseed the festival data from
 *    festival.json so staging always has predictable demo data.
 *    Production branches skip the seed step entirely (clean slate).
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const branch = process.env.VERCEL_GIT_COMMIT_REF ?? "";
const env = process.env.VERCEL_ENV ?? "";
const isStaging = branch === "staging";

function log(msg) {
  console.log(`\u001b[36m[vercel-build]\u001b[0m ${msg}`);
}

log(`branch=${branch || "(unknown)"} env=${env || "(unknown)"} staging=${isStaging}`);

if (!process.env.CONVEX_DEPLOY_KEY) {
  console.error(
    "[vercel-build] CONVEX_DEPLOY_KEY is not set. Add it to the Vercel environment.",
  );
  process.exit(1);
}

execSync(
  // --check-build-environment disable lets us point a "prod" Convex deploy
  // key at the staging Vercel environment (which Vercel reports as "preview"),
  // since our staging Convex project is intentionally a separate prod deployment.
  "npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL --check-build-environment disable",
  { stdio: "inherit" },
);

if (isStaging) {
  log("Seeding staging Convex deployment from festival.json");
  const data = JSON.parse(
    readFileSync(path.resolve("festival.json"), "utf8"),
  );
  const args = JSON.stringify({ data });
  execSync(
    `npx convex run seed:seedFestival ${JSON.stringify(args)}`,
    { stdio: "inherit" },
  );
  log("Staging seed complete");
} else {
  log("Skipping seed (not the staging branch)");
}
