import { useState } from "react";
import {
  ChevronDown,
  Clock,
  History,
  LogIn,
  LogOut,
  MapPin,
  PenLine,
  Plus,
  StickyNote,
  Type as TypeIcon,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { useCachedQuery } from "@/lib/useCachedQuery";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

interface Props {
  ownerType: "sidequest" | "convergence";
  ownerId: string;
  membersById: Map<string, Doc<"members">>;
  className?: string;
}

/**
 * Append-only history of changes to a sidequest or convergence.
 * Collapsed by default with a single "Activity (N)" trigger; once
 * expanded the events render newest-first.
 *
 * If there's no activity yet, nothing is rendered — the section is a
 * footnote, not a placeholder.
 */
export function ChangelogSection({
  ownerType,
  ownerId,
  membersById,
  className,
}: Props) {
  const rows = useCachedQuery(api.activity.listForOwner, {
    ownerType,
    ownerId,
  });
  const [expanded, setExpanded] = useState(false);

  const loading = rows === undefined;
  const list = rows ?? [];

  // Empty state: render nothing rather than a noisy "no activity"
  // pill. The section is supplemental info; absence is acceptable.
  if (!loading && list.length === 0) return null;

  if (!expanded) {
    return (
      <div className={cn(className)}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex w-full items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary/60"
        >
          <History className="size-3.5" />
          <span>{loading ? "Activity…" : `View activity (${list.length})`}</span>
          <ChevronDown className="ml-auto size-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <History className="size-3" />
          Activity
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
            {list.length}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex items-center gap-1 rounded text-[10px] font-medium normal-case tracking-normal text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Collapse activity"
        >
          Hide
          <ChevronDown className="size-3 rotate-180" />
        </button>
      </div>

      <ul className="space-y-1">
        {list.map((row) => {
          const author = row.actorMemberId
            ? membersById.get(row.actorMemberId)
            : undefined;
          const Icon = iconFor(row.kind);
          return (
            <li
              key={row._id}
              className="flex items-start gap-2 rounded-md border border-border/40 bg-card/30 px-2.5 py-1.5"
            >
              <Icon className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 text-[11px] leading-snug">
                <div className="flex flex-wrap items-baseline gap-x-1.5 text-foreground">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: author?.color ?? "#6b7280" }}
                    />
                    {author?.name ?? "Someone"}
                  </span>
                  <span className="text-muted-foreground">
                    {describeAction(row, ownerType)}
                  </span>
                </div>
                {detailFor(row, ownerType) && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {detailFor(row, ownerType)}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {formatRelative(row.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type ActivityRow = Doc<"activity">;

function iconFor(kind: ActivityRow["kind"]) {
  switch (kind) {
    case "created":
      return Plus;
    case "spot_changed":
      return MapPin;
    case "time_changed":
    case "schedule_changed":
      return Clock;
    case "title_changed":
      return TypeIcon;
    case "location_changed":
      return MapPin;
    case "notes_changed":
      return StickyNote;
    case "pin_changed":
      return MapPin;
    case "joined":
      return LogIn;
    case "left":
      return LogOut;
    default:
      return PenLine;
  }
}

/**
 * Short verb-phrase summary of the event, e.g. "set the meet spot",
 * "joined", "renamed it". Pairs with the actor name in the rendered
 * row to read as a sentence.
 */
function describeAction(
  row: ActivityRow,
  ownerType: "sidequest" | "convergence",
): string {
  const d = row.data ?? {};
  switch (row.kind) {
    case "created":
      return ownerType === "sidequest"
        ? "created this sidequest"
        : "started this convergence";
    case "spot_changed": {
      if (!d.toLabel && d.fromLabel) return "cleared the meet spot";
      if (!d.fromLabel && d.toLabel) return "set the meet spot";
      return "changed the meet spot";
    }
    case "time_changed": {
      const hadFrom = d.fromMeetMs !== undefined;
      const hasTo = d.toMeetMs !== undefined;
      if (!hasTo && hadFrom) return "cleared the meet time";
      if (!hadFrom && hasTo) return "set the meet time";
      return "changed the meet time";
    }
    case "title_changed":
      return "renamed it";
    case "location_changed": {
      if (!d.toLocation && d.fromLocation) return "cleared the location";
      if (!d.fromLocation && d.toLocation) return "set the location";
      return "changed the location";
    }
    case "notes_changed":
      return "updated the notes";
    case "schedule_changed":
      return "moved the time";
    case "pin_changed":
      // Legacy event kind from when pins lived on the entity itself.
      // New pins live on the spots table and don't log here. Kept for
      // backward compatibility on any historical rows.
      return "updated the map pin";
    case "joined":
      return "joined";
    case "left":
      return "left";
    default:
      return "edited";
  }
}

/**
 * The "from → to" detail line shown under the action verb. Returns
 * an empty string when there's nothing useful to display (e.g.
 * `joined` / `left`, or a notes change where we deliberately don't
 * print the diff).
 */
function detailFor(
  row: ActivityRow,
  _ownerType: "sidequest" | "convergence",
): string {
  const d = row.data ?? {};
  switch (row.kind) {
    case "created":
      if (d.toTitle) return `“${d.toTitle}”`;
      return "";
    case "spot_changed": {
      if (!d.toLabel && d.fromLabel) return `was ${d.fromLabel}`;
      if (!d.fromLabel && d.toLabel) return d.toLabel;
      if (d.fromLabel && d.toLabel) return `${d.fromLabel} → ${d.toLabel}`;
      return "";
    }
    case "time_changed": {
      const fromStr = formatMeetWindow(d.fromMeetMs, d.fromMeetEndMs);
      const toStr = formatMeetWindow(d.toMeetMs, d.toMeetEndMs);
      if (fromStr && toStr) return `${fromStr} → ${toStr}`;
      if (toStr) return toStr;
      if (fromStr) return `was ${fromStr}`;
      return "";
    }
    case "title_changed":
      if (d.fromTitle && d.toTitle) return `${d.fromTitle} → ${d.toTitle}`;
      return d.toTitle ?? "";
    case "location_changed": {
      if (!d.toLocation && d.fromLocation) return `was ${d.fromLocation}`;
      if (!d.fromLocation && d.toLocation) return d.toLocation;
      if (d.fromLocation && d.toLocation)
        return `${d.fromLocation} → ${d.toLocation}`;
      return "";
    }
    case "schedule_changed":
      if (d.toStartMs !== undefined && d.toEndMs !== undefined) {
        return `${formatTime(d.toStartMs)} – ${formatTime(d.toEndMs)}`;
      }
      return "";
    case "pin_changed": {
      if (d.toMapX !== undefined && d.toMapY !== undefined) {
        return `${(d.toMapX * 100).toFixed(0)}%, ${(d.toMapY * 100).toFixed(0)}%`;
      }
      return "";
    }
    default:
      return "";
  }
}

function formatMeetWindow(
  startMs: number | undefined,
  endMs: number | undefined,
): string {
  if (startMs === undefined) return "";
  if (endMs !== undefined && endMs > startMs) {
    return `${formatTime(startMs)} – ${formatTime(endMs)}`;
  }
  return formatTime(startMs);
}

function formatRelative(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  const diff = Date.now() - ms;
  if (diff < 30 * 1000) return "just now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 12 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h`;
  try {
    return TIME_FORMAT.format(new Date(ms));
  } catch {
    return "";
  }
}
