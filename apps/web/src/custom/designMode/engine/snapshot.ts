import {
  DESIGN_MODE_STYLE_KEYS,
  type DesignModeElementSnapshot,
  type DesignModeStyleKey,
} from "../protocol";
import { alignCapsFor } from "./align";
import { readSizeModes } from "./sizeMode";
import type { DraftStore } from "./vendor/drafts";
import { positionStateOf, POSITION_ROWS } from "./vendor/panel-specs";
import { basename, parseSourceAttr, type TaggedElement } from "./vendor/source";

/** The X/Y readout, in the margin-edge basis the panel's fields also WRITE (POSITION_ROWS
 * owns both halves, so the field can never display a basis it doesn't commit to). */
function readOffsets(el: TaggedElement): { x: number; y: number } {
  const readX = POSITION_ROWS[0].read;
  const readY = POSITION_ROWS[1].read;
  return {
    x: Math.round(readX ? readX(el) : 0),
    y: Math.round(readY ? readY(el) : 0),
  };
}

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
    offsets: readOffsets(el),
    positionState: positionStateOf(el, drafts),
    alignCaps: alignCapsFor(el, drafts),
    drafted: [...(drafts.entries().get(el)?.keys() ?? [])],
  };
}
