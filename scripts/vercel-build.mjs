#!/usr/bin/env node
/**
 * Vercel build entrypoint.
 *
 * Steps:
 * 1. Push the latest Convex schema/functions to whichever deployment
 *    CONVEX_DEPLOY_KEY points at, then run `npm run build` with
 *    VITE_CONVEX_URL set to that deployment's URL.
 * 2. If this is the staging branch, replace ALL data in the staging
 *    Convex deployment with the snapshot at seeds/dev-snapshot.zip
 *    (a snapshot of our development environment) so QA always has
 *    realistic data to poke at. Production never auto-seeds — its
 *    artist lineup is seeded once manually via festival.json and
 *    never clobbered by a deploy.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const branch = process.env.VERCEL_GIT_COMMIT_REF ?? "";
const env = process.env.VERCEL_ENV ?? "";
const isStaging = branch === "staging";
const snapshotPath = "seeds/dev-snapshot.zip";

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
  if (!existsSync(path.resolve(snapshotPath))) {
    console.error(
      `[vercel-build] ${snapshotPath} not found. Run \`npx convex export --path ${snapshotPath} --deployment dev\` and commit it.`,
    );
    process.exit(1);
  }
  log(`Replacing staging data with snapshot ${snapshotPath}`);
  execSync(
    `npx convex import --replace-all -y ${JSON.stringify(snapshotPath)}`,
    { stdio: "inherit" },
  );
  log("Staging data replaced with dev snapshot");
} else {
  log("Skipping seed (production / non-staging branch). Production is seeded once manually.");
}
