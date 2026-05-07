/**
 * Shared mention parser for comment bodies.
 *
 * A mention is `@<MemberName>` where MemberName matches a current
 * member's name exactly (longest-match wins for overlapping names like
 * "Mark" / "Mark H") and ends at a word boundary (whitespace,
 * punctuation, or end-of-string).
 *
 * Used by both the Convex `comments.add` mutation (to compute
 * `mentionedMemberIds`) and the client renderer. Keeping the same
 * algorithm on both sides avoids drift between what the user sees
 * highlighted and who actually got tagged.
 */

export interface MentionMember {
  _id: string;
  name: string;
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

/**
 * Distinct, ordered list of memberIds tagged in `body`. Order matches
 * appearance order; duplicates are dropped.
 */
export function mentionedMemberIdsFromBody(
  body: string,
  members: ReadonlyArray<MentionMember>,
): string[] {
  const matches = parseMentions(body, members);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    if (seen.has(m.memberId)) continue;
    seen.add(m.memberId);
    out.push(m.memberId);
  }
  return out;
}
