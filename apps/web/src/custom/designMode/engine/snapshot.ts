import {
  DESIGN_MODE_STYLE_KEYS,
  type DesignModeElementSnapshot,
  type DesignModeStyleKey,
} from "../protocol";
import { readSizeModes } from "./sizeMode";
import type { DraftStore } from "./vendor/drafts";
import { basename, parseSourceAttr, type TaggedElement } from "./vendor/source";

/** Reads the native panel's property set off an element's live computed style. Computed
 * values include any active inline-style drafts, so a re-selection always shows the
 * drafted state — the same read the change-request builder measures from. Size modes
 * read draft-first (sizeMode.ts), which is why the DraftStore rides along. */
export function buildElementSnapshot(
  el: TaggedElement,
  id: number,
  drafts: DraftStore,
): DesignModeElementSnapshot {
  const computed = getComputedStyle(el);
  const styles = {} as Record<DesignModeStyleKey, string>;
  for (const key of DESIGN_MODE_STYLE_KEYS) {
    styles[key] = computed.getPropertyValue(key);
  }
  const dcSource = el.dataset.dcSource ?? "";
  const parsed = dcSource ? parseSourceAttr(dcSource) : null;
  return {
    id,
    tag: el.tagName.toLowerCase(),
    sourceLabel: parsed ? `${basename(parsed.file)}:${parsed.line}` : null,
    styles,
    sizeModes: readSizeModes(el, drafts),
  };
}
