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

/**
 * Servers without inline message context get their context records serialized as trailing
 * blocks (`serializeLegacyContextMessage`), which would land AFTER the design run and hide it
 * from the extractor above. Serialize the prompt without the run, then put the run back last.
 */
/**
 * The prose and the raw wrapped run, separately. `run` is the verbatim trailing blocks
 * (empty when there are none), so a caller can hold it aside and re-append it unchanged —
 * the queued-run edit does exactly that to keep the markup out of the composer.
 */
export function splitTrailingDesignChangeRun(text: string): {
  readonly promptText: string;
  readonly run: string;
} {
  const { promptText, blocks } = extractTrailingDesignChanges(text);
  if (blocks.length === 0) return { promptText: text, run: "" };
  // promptText is a trimmed prefix of text, so the rest is the raw wrapped run.
  return { promptText, run: text.slice(promptText.length).trimStart() };
}

export function withDesignChangesTrailing(
  text: string,
  serialize: (promptText: string) => string,
): string {
  const { promptText, run } = splitTrailingDesignChangeRun(text);
  if (run.length === 0) return serialize(text);
  const serialized = serialize(promptText);
  return serialized.length > 0 ? `${serialized}\n\n${run}` : run;
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
