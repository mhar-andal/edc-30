import { type ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import {
  Calendar,
  Compass,
  Edit2,
  LogOut,
  MapPin,
  Trash2,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { useMemberSession, clearStored } from "@/lib/useMemberSession";
import { useIsOffline } from "@/lib/useIsOffline";
import { MemberDot } from "@/components/MemberDot";
import { OfflineBadge } from "@/components/OfflineBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ColorPicker } from "@/components/ColorPicker";
import { MEMBER_PALETTE } from "@/lib/colors";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/schedule", label: "Schedule", icon: Calendar },
  { to: "/coordinate", label: "Coordinate", icon: Compass },
  { to: "/meetups", label: "Meetups", icon: MapPin },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const session = useMemberSession();

  return (
    <div className="flex h-full flex-col">
      <header
        className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <NavLink to="/schedule" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-primary/15 text-primary font-bold text-sm">
              E
            </span>
            <span className="hidden text-sm font-semibold tracking-wide sm:inline">
              EDC Schedule
            </span>
          </NavLink>
          <nav className="hidden items-center gap-1 md:flex">
            {TABS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <OfflineBadge />
            {session.status === "authed" && (
              <MemberMenu
                memberId={session.memberId}
                memberName={session.memberName}
                memberColor={session.memberColor}
              />
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <div
          className="mx-auto w-full max-w-7xl px-3 pt-3 sm:px-6 sm:pb-10"
          style={{
            paddingBottom:
              "max(6rem, calc(env(safe-area-inset-bottom) + 5rem))",
          }}
        >
          {children}
        </div>
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-3">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )
              }
            >
              <Icon className="size-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function MemberMenu({
  memberId,
  memberName,
  memberColor,
}: {
  memberId: import("../../convex/_generated/dataModel").Id<"members">;
  memberName: string;
  memberColor: string;
}) {
  const navigate = useNavigate();
  const members = useCachedQuery(api.members.list);
  const renameMember = useMutation(api.members.rename);
  const setMemberColor = useMutation(api.members.setColor);
  const removeMember = useMutation(api.members.remove);
  const offline = useIsOffline();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(memberName);
  const [error, setError] = useState<string | null>(null);

  const takenBy = (members ?? [])
    .filter((m: Doc<"members">) => m._id !== memberId)
    .map((m: Doc<"members">) => ({ color: m.color, name: m.name }));

  function logout() {
    clearStored();
    navigate("/", { replace: true });
  }

  async function commitName() {
    if (offline) return;
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === memberName) {
      setEditing(false);
      setDraftName(memberName);
      return;
    }
    try {
      await renameMember({ memberId, name: trimmed });
      setEditing(false);
    } catch (err) {
      const m = err instanceof Error ? err.message : "Failed";
      setError(m.includes("NAME_TAKEN") ? "Name taken" : m);
    }
  }

  async function handleColor(c: string) {
    if (offline) return;
    setError(null);
    try {
      await setMemberColor({ memberId, color: c });
    } catch (err) {
      const m = err instanceof Error ? err.message : "Failed";
      setError(m.includes("COLOR_TAKEN") ? "Color taken" : m);
    }
  }

  async function handleDelete() {
    if (offline) return;
    if (
      !confirm(
        "Delete your member? Your selections + meetups you authored are removed and your local session is cleared.",
      )
    )
      return;
    try {
      await removeMember({ memberId });
      clearStored();
      navigate("/", { replace: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-card"
          aria-label="Your profile"
        >
          <MemberDot color={memberColor} />
          <span className="max-w-[10ch] truncate">{memberName}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            Name
          </div>
          {editing ? (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={draftName}
                maxLength={32}
                disabled={offline}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitName();
                  if (e.key === "Escape") {
                    setEditing(false);
                    setDraftName(memberName);
                  }
                }}
              />
              <Button
                size="sm"
                onClick={commitName}
                disabled={offline}
                title={offline ? "Offline — reconnect to rename" : undefined}
              >
                Save
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{memberName}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={offline}
                title={offline ? "Offline — reconnect to rename" : undefined}
                onClick={() => {
                  setEditing(true);
                  setError(null);
                }}
              >
                <Edit2 className="size-3.5" /> Rename
              </Button>
            </div>
          )}
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          {offline && (
            <p className="mt-1 text-xs text-amber-300">
              Offline — profile changes are disabled.
            </p>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            Color
          </div>
          <ColorPicker
            value={memberColor}
            onChange={handleColor}
            palette={MEMBER_PALETTE}
            takenBy={takenBy}
            disabled={offline}
            disabledReason="Offline — reconnect to change color"
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={offline}
            title={offline ? "Offline — reconnect to delete" : undefined}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" /> Delete me
          </Button>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="size-3.5" /> Sign out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
