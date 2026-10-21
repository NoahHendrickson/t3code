/**
 * The per-row glyph in the layers rail. Figma's layers panel is scannable because the icon
 * says what KIND of thing a row is before you read its name; the tag is the only type
 * signal a DOM tree has, mapped through the same designer vocabulary the guest's labels use
 * (engine/vendor/layers.ts TAG_LABELS — a div is a Frame).
 */
import {
  Article,
  Cube,
  CursorText,
  Image as ImageIcon,
  Link,
  ListBullets,
  Square,
  Textbox,
  TextT,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";

import { glyph } from "./PanelIcons";

const BY_TAG: Record<string, PhosphorIcon> = {
  a: Link,
  article: Article,
  button: CursorText,
  h1: TextT,
  h2: TextT,
  h3: TextT,
  h4: TextT,
  h5: TextT,
  h6: TextT,
  img: ImageIcon,
  input: Textbox,
  li: ListBullets,
  ol: ListBullets,
  p: TextT,
  picture: ImageIcon,
  select: Textbox,
  span: TextT,
  svg: Cube,
  textarea: Textbox,
  ul: ListBullets,
  video: ImageIcon,
};

/** One wrapper per distinct glyph, built at load — `glyph()` pins the panel's weight, and
 * a render must pick a component type, never mint one. */
const WRAPPED = new Map<PhosphorIcon, ReturnType<typeof glyph>>(
  [...new Set([...Object.values(BY_TAG), Square])].map((Base) => [Base, glyph(Base)]),
);
const FALLBACK_GLYPH = WRAPPED.get(Square)!;

export function LayerTypeIcon({ tag, className }: { tag: string; className?: string }) {
  const Base = BY_TAG[tag];
  const Glyph = (Base && WRAPPED.get(Base)) ?? FALLBACK_GLYPH;
  // oxlint-disable-next-line react/static-components -- Glyph is looked up from WRAPPED, built once at load, so a render never mints a component type.
  return <Glyph className={className} aria-hidden />;
}
