import type { AgentHandle } from '../types';
import { ROSTER } from '../agents/registry';

const HANDLES = new Set<string>(ROSTER.map((a) => a.handle));

// Matches @tanit, @break, @forge, @gossip, @prism, @lui (case-insensitive),
// anchored at start of line OR after whitespace, followed by handle chars.
// We don't try to be clever about mid-word @s — agent handles are short and
// distinctive enough.
const MENTION_RE = /(?:^|\s)@([a-zA-Z][a-zA-Z0-9_-]{1,31})/g;

/**
 * Extract @mentions from a message body. Returns the unique agent handles
 * present in the text, in order of first appearance.
 */
export function extractMentions(content: string): AgentHandle[] {
  const seen = new Set<string>();
  const out: AgentHandle[] = [];
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(content)) !== null) {
    const cand = m[1]?.toLowerCase();
    if (!cand) continue;
    if (!HANDLES.has(cand)) continue;
    if (seen.has(cand)) continue;
    seen.add(cand);
    out.push(cand as AgentHandle);
  }
  return out;
}
