import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useIsOffline } from "./useIsOffline";

const STORAGE_KEY = "edc.member.session.v1";

interface StoredSession {
  memberId: Id<"members">;
  memberName: string;
  /**
   * Persisted alongside name/id so the app shell can paint correctly
   * during a cold-offline boot (no Convex round-trip available yet).
   * Optional for backwards compat with sessions that were written by
   * an older build.
   */
  memberColor?: string;
}

// Used only when an older stored session has no `memberColor` yet. The
// session hook keeps this in sync with the live record once Convex
// reconnects, so this fallback is just for the very first paint after
// a build-upgrade.
const FALLBACK_COLOR = "#6b7280";

type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | {
      status: "authed";
      memberId: Id<"members">;
      memberName: string;
      memberColor: string;
    };

function readStored(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed?.memberId || !parsed?.memberName) return null;
    return {
      memberId: parsed.memberId,
      memberName: parsed.memberName,
      memberColor:
        typeof parsed.memberColor === "string" ? parsed.memberColor : undefined,
    };
  } catch {
    return null;
  }
}

export function writeStored(session: StoredSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStored(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function useMemberSession(): SessionState {
  const [stored, setStored] = useState<StoredSession | null>(() => readStored());
  const offline = useIsOffline();

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setStored(readStored());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const member = useQuery(
    api.members.get,
    stored ? { memberId: stored.memberId } : "skip",
  );

  // Whenever a live `member` record comes in, mirror name + color into
  // localStorage. This keeps the next cold-offline boot in sync with the
  // server (e.g. user changed their display name yesterday while online,
  // closes the PWA, reopens it on the plane offline → still sees the
  // correct name in the header).
  useEffect(() => {
    if (!member || !stored) return;
    if (
      member.name === stored.memberName &&
      member.color === stored.memberColor
    ) {
      return;
    }
    const next: StoredSession = {
      memberId: member._id,
      memberName: member.name,
      memberColor: member.color,
    };
    writeStored(next);
    setStored(next);
  }, [member, stored]);

  if (!stored) return { status: "anonymous" };

  if (member === undefined) {
    // Cold start with no network (PWA swiped away then reopened on a
    // plane / in a dead zone). Without this branch the query stays
    // `undefined` forever, leaving the user staring at "Loading…".
    // We optimistically trust the locally persisted session so they
    // land on the app shell and can read their cached schedule. Once
    // Convex reconnects the regular branches below will reconcile —
    // including signing them out if the account no longer exists.
    if (offline) {
      return {
        status: "authed",
        memberId: stored.memberId,
        memberName: stored.memberName,
        memberColor: stored.memberColor ?? FALLBACK_COLOR,
      };
    }
    return { status: "loading" };
  }
  if (member === null) {
    clearStored();
    return { status: "anonymous" };
  }
  return {
    status: "authed",
    memberId: member._id,
    memberName: member.name,
    memberColor: member.color,
  };
}
