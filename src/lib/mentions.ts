/**
 * Client-side mention parser, mirrors `convex/mentions.ts`.
 *
 * Mentions are `@<MemberName>` where MemberName matches a current
 * member's name exactly (longest-match wins) and ends at a word
 * boundary. Plain text. The renderer surfaces resolved mentions as
 * colored chips inline.
 */

export interface MentionMember {
  _id: string;
  name: string;
  color: string;
}

export interface MentionMatch {
  /** Index of the leading `@`. */
  start: number;
  /** Total length, including the `@`. */
  length: number;
  memberId: string;
  memberName: string;
}

const BOUNDARY_RE = /[\s.,!?;:"')\]]/;

export function parseMentions(
  body: string,
  members: ReadonlyArray<MentionMember>,
): MentionMatch[] {
  if (!body) return [];
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  const out: MentionMatch[] = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] !== "@") {
      i++;
      continue;
    }
    let matched: { id: string; name: string; len: number } | null = null;
    for (const m of sorted) {
      if (m.name.length === 0) continue;
      if (body.startsWith(m.name, i + 1)) {
        const after = body[i + 1 + m.name.length];
        if (after === undefined || BOUNDARY_RE.test(after)) {
          matched = { id: m._id, name: m.name, len: m.name.length };
          break;
        }
      }
    }
    if (matched) {
      out.push({
        start: i,
        length: matched.len + 1,
        memberId: matched.id,
        memberName: matched.name,
      });
      i += matched.len + 1;
    } else {
      i++;
    }
  }
  return out;
}

export type RenderToken =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string; memberId: string };

/**
 * Split a body string into a flat list of tokens for inline rendering.
 * Each token is either plain text or a resolved mention chip.
 */
export function tokenizeForRender(
  body: string,
  members: ReadonlyArray<MentionMember>,
): RenderToken[] {
  const matches = parseMentions(body, members);
  if (matches.length === 0) {
    return body ? [{ kind: "text", text: body }] : [];
  }
  const out: RenderToken[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      out.push({ kind: "text", text: body.slice(cursor, m.start) });
    }
    out.push({
      kind: "mention",
      text: body.slice(m.start, m.start + m.length),
      memberId: m.memberId,
    });
    cursor = m.start + m.length;
  }
  if (cursor < body.length) {
    out.push({ kind: "text", text: body.slice(cursor) });
  }
  return out;
}

/**
 * If the caret sits inside an in-progress mention (the user just typed
 * `@` and possibly some characters with no whitespace), return the
 * `@` index and current query string. Otherwise null.
 */
export function findActiveMentionTrigger(
  body: string,
  caret: number,
): { atIndex: number; query: string } | null {
  if (caret < 0 || caret > body.length) return null;
  // Walk backwards from the caret looking for an `@` with the segment
  // between it and the caret containing only allowed mention-query
  // characters (letters, digits, single spaces, dots, hyphens, '). The
  // segment must not start with whitespace immediately after `@`.
  let i = caret - 1;
  while (i >= 0) {
    const ch = body[i];
    if (ch === "@") {
      // Make sure the `@` is at a word start: either at the beginning
      // of the body or preceded by whitespace / punctuation.
      const before = i > 0 ? body[i - 1] : undefined;
      const ok = before === undefined || /[\s.,!?;:"'(\[]/.test(before);
      if (!ok) return null;
      const query = body.slice(i + 1, caret);
      // Bail if the query started with whitespace (just a stray `@ `).
      if (query.length > 0 && /^\s/.test(query)) return null;
      return { atIndex: i, query };
    }
    // Allow the typical name characters and a single space inside a
    // mention query so multi-word names ("Mark H") are still trigger-able.
    if (!/[\w'.\- ]/.test(ch)) return null;
    i--;
  }
  return null;
}

/**
 * Filter members for the autocomplete picker.
 */
export function filterMembersForMention(
  members: ReadonlyArray<MentionMember>,
  query: string,
  excludeMemberId?: string | null,
  limit = 6,
): MentionMember[] {
  const q = query.trim().toLowerCase();
  const out: MentionMember[] = [];
  // Exact prefix matches first, then substring matches.
  const prefix: MentionMember[] = [];
  const substring: MentionMember[] = [];
  for (const m of members) {
    if (excludeMemberId && m._id === excludeMemberId) continue;
    const lower = m.name.toLowerCase();
    if (q.length === 0) {
      prefix.push(m);
      continue;
    }
    if (lower.startsWith(q)) prefix.push(m);
    else if (lower.includes(q)) substring.push(m);
  }
  prefix.sort((a, b) => a.name.localeCompare(b.name));
  substring.sort((a, b) => a.name.localeCompare(b.name));
  for (const m of [...prefix, ...substring]) {
    if (out.length >= limit) break;
    out.push(m);
  }
  return out;
}
