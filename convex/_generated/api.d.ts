/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as artists from "../artists.js";
import type * as comments from "../comments.js";
import type * as meetups from "../meetups.js";
import type * as memberSelections from "../memberSelections.js";
import type * as members from "../members.js";
import type * as mentions from "../mentions.js";
import type * as seed from "../seed.js";
import type * as sidequests from "../sidequests.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  artists: typeof artists;
  comments: typeof comments;
  meetups: typeof meetups;
  memberSelections: typeof memberSelections;
  members: typeof members;
  mentions: typeof mentions;
  seed: typeof seed;
  sidequests: typeof sidequests;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
