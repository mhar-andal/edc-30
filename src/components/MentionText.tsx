import { Fragment } from "react";
import { tokenizeForRender, type MentionMember } from "@/lib/mentions";
import { cn } from "@/lib/utils";

interface Props {
  body: string;
  members: ReadonlyArray<MentionMember>;
  /** When set, mentions of this member get a stronger highlight. */
  myMemberId?: string | null;
  className?: string;
}

/**
 * Renders a comment body, turning resolved `@Name` substrings into
 * colored chips inline. Plain text segments preserve whitespace + line
 * breaks (whitespace-pre-wrap).
 */
export function MentionText({ body, members, myMemberId, className }: Props) {
  const tokens = tokenizeForRender(body, members);
  if (tokens.length === 0) return null;
  const colorByMember = new Map<string, string>();
  for (const m of members) colorByMember.set(m._id, m.color);
  return (
    <span
      className={cn("whitespace-pre-wrap break-words text-sm", className)}
    >
      {tokens.map((t, i) => {
        if (t.kind === "text") {
          return <Fragment key={i}>{t.text}</Fragment>;
        }
        const color = colorByMember.get(t.memberId) ?? "rgb(244 244 245)";
        const me = !!myMemberId && t.memberId === myMemberId;
        return (
          <span
            key={i}
            className={cn(
              "mx-0.5 inline-flex items-center gap-1 rounded px-1 align-baseline text-[0.85em] font-medium ring-1",
              me
                ? "bg-primary/25 text-primary-foreground ring-primary/60"
                : "ring-transparent",
            )}
            style={
              me
                ? undefined
                : {
                    backgroundColor: `${color}1f`,
                    color,
                  }
            }
            title={`Tagged ${t.text.slice(1)}`}
          >
            {t.text}
          </span>
        );
      })}
    </span>
  );
}
