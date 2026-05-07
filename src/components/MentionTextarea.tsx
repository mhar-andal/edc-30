import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  filterMembersForMention,
  findActiveMentionTrigger,
  type MentionMember,
} from "@/lib/mentions";
import { cn } from "@/lib/utils";

export interface MentionTextareaHandle {
  focus: () => void;
  blur: () => void;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  members: ReadonlyArray<MentionMember>;
  /** Member id to omit from the suggestion list (typically the author). */
  excludeMemberId?: string | null;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
  className?: string;
}

/**
 * Plain textarea that pops a member-picker when the user types `@`.
 * Selecting a member (Tab / Enter / click) replaces the in-progress
 * mention query with `@FullName`. Up/Down arrows traverse suggestions.
 *
 * Mentions are stored verbatim in the body — the renderer separately
 * resolves `@Name` substrings to chips by scanning against the same
 * member list.
 */
export const MentionTextarea = forwardRef<MentionTextareaHandle, Props>(
  function MentionTextarea(
    {
      value,
      onChange,
      onSubmit,
      placeholder,
      members,
      excludeMemberId,
      disabled,
      rows = 2,
      maxLength,
      className,
    },
    ref,
  ) {
    const taRef = useRef<HTMLTextAreaElement>(null);
    const [trigger, setTrigger] = useState<
      | { atIndex: number; query: string; suggestions: MentionMember[] }
      | null
    >(null);
    const [hi, setHi] = useState(0);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => taRef.current?.focus(),
        blur: () => taRef.current?.blur(),
      }),
      [],
    );

    function recomputeTrigger(nextValue: string, caret: number) {
      const t = findActiveMentionTrigger(nextValue, caret);
      if (!t) {
        setTrigger(null);
        setHi(0);
        return;
      }
      const suggestions = filterMembersForMention(
        members,
        t.query,
        excludeMemberId ?? null,
      );
      if (suggestions.length === 0) {
        setTrigger(null);
        setHi(0);
        return;
      }
      setTrigger({ atIndex: t.atIndex, query: t.query, suggestions });
      setHi((prev) => (prev >= suggestions.length ? 0 : prev));
    }

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const next = e.target.value;
      onChange(next);
      const caret = e.target.selectionStart ?? next.length;
      recomputeTrigger(next, caret);
    }

    function handleSelectionChange() {
      const ta = taRef.current;
      if (!ta) return;
      recomputeTrigger(value, ta.selectionStart ?? value.length);
    }

    function applyMention(member: MentionMember) {
      if (!trigger) return;
      const ta = taRef.current;
      if (!ta) return;
      const before = value.slice(0, trigger.atIndex);
      const afterCaret = ta.selectionStart ?? value.length;
      const after = value.slice(afterCaret);
      // If the next character is already whitespace, don't double-up.
      const padding = after.startsWith(" ") || after.length === 0 ? "" : " ";
      const inserted = `@${member.name}${padding}`;
      const next = before + inserted + after;
      onChange(next);
      const caretTarget = before.length + inserted.length;
      // Schedule caret reposition for the next paint (after React commits
      // the new value).
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (!el) return;
        el.focus();
        try {
          el.setSelectionRange(caretTarget, caretTarget);
        } catch {
          /* ignore */
        }
      });
      setTrigger(null);
      setHi(0);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (trigger && trigger.suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHi((i) => (i + 1) % trigger.suggestions.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHi((i) =>
            i === 0 ? trigger.suggestions.length - 1 : i - 1,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          applyMention(trigger.suggestions[hi]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setTrigger(null);
          setHi(0);
          return;
        }
      }
      if (
        onSubmit &&
        e.key === "Enter" &&
        (e.metaKey || e.ctrlKey) &&
        !trigger
      ) {
        e.preventDefault();
        onSubmit();
      }
    }

    // Hide the suggestions if the textarea blurs (let the user click
    // a suggestion via mousedown before it disappears though).
    function handleBlur() {
      // Defer so a click on a suggestion can fire first.
      setTimeout(() => setTrigger(null), 80);
    }

    useEffect(() => {
      // If the value changed externally (e.g. parent clears it), drop
      // any stale trigger.
      if (!value) {
        setTrigger(null);
        setHi(0);
      }
    }, [value]);

    return (
      <div className={cn("relative", className)}>
        <textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelectionChange}
          onClick={handleSelectionChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          maxLength={maxLength}
          className="flex min-h-[2.25rem] w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        {trigger && trigger.suggestions.length > 0 && (
          <div
            className="absolute left-0 top-full z-50 mt-1 w-full max-w-xs overflow-hidden rounded-md border border-border/60 bg-popover text-popover-foreground shadow-lg"
            role="listbox"
            aria-label="Mention suggestions"
          >
            <div className="border-b border-border/40 px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Tag a friend · ↑/↓ + ↵
            </div>
            <ul className="max-h-56 overflow-y-auto">
              {trigger.suggestions.map((m, i) => {
                const active = i === hi;
                return (
                  <li key={m._id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      // Use mousedown so we fire before blur dismisses the popover.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        applyMention(m);
                      }}
                      onMouseEnter={() => setHi(i)}
                      className={cn(
                        "flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors",
                        active ? "bg-secondary/70" : "hover:bg-secondary/40",
                      )}
                    >
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: m.color }}
                      />
                      <span className="truncate">{m.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  },
);
