import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const STORAGE_KEY = "edc.member.session.v1";

interface StoredSession {
  memberId: Id<"members">;
  memberName: string;
}

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
    return { memberId: parsed.memberId, memberName: parsed.memberName };
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

  if (!stored) return { status: "anonymous" };
  if (member === undefined) return { status: "loading" };
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
