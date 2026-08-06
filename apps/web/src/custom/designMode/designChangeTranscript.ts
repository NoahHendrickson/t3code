/**
 * Transcript-side extraction for `<design_change_request>` blocks — the mirror of the
 * send path's append (designChangeDraftStore.forkDesignChanges.appendToPrompt). Blocks
 * are appended after every other context block at send time, so on display they are the
 * outermost trailing run and must be stripped FIRST — that also restores the "trailing"
 * position the upstream element/terminal extractors rely on.
 */

const TRAILING_DESIGN_CHANGE_BLOCKS_PATTERN =
  /\n*(?:<design_change_request>\n[\s\S]*?\n<\/design_change_request>\s*)+$/u;

const DESIGN_CHANGE_BLOCK_PATTERN =
  /<design_change_request>\n([\s\S]*?)\n<\/design_change_request>/gu;

export interface ExtractedDesignChanges {
  readonly promptText: string;
  /** The inner change-request markdown of each block, send order preserved. */
  readonly blocks: readonly string[];
}

export function extractTrailingDesignChanges(prompt: string): ExtractedDesignChanges {
  // Runs per render of every user row in the transcript, and almost no message carries a
  // block — a literal scan is far cheaper than the regex, and answers for all of them.
  if (!prompt.includes("<design_change_request>")) return { promptText: prompt, blocks: [] };
  const match = TRAILING_DESIGN_CHANGE_BLOCKS_PATTERN.exec(prompt);
  if (!match) return { promptText: prompt, blocks: [] };
  const blocks = [...match[0].matchAll(DESIGN_CHANGE_BLOCK_PATTERN)].map((block) => block[1] ?? "");
  return { promptText: prompt.slice(0, match.index).trimEnd(), blocks };
}

export interface DesignChangeBlockSummary {
  readonly elementCount: number;
  /** The first element header ("<button> — src/App.tsx:42:5"), or null. */
  readonly firstLabel: string | null;
}

/** Summarizes one block off its `## N. <tag> — file:line:col` element headers. */
export function summarizeDesignChangeBlock(markdown: string): DesignChangeBlockSummary {
  const headers = [...markdown.matchAll(/^## \d+\. (.+)$/gmu)].map((m) => m[1] ?? "");
  return { elementCount: headers.length, firstLabel: headers[0] ?? null };
}
