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

/** One wrapper per distinct glyph, built once — `glyph()` pins the panel's weight, and
 * memoizing here keeps the row from minting a component type per render. */
const WRAPPED = new Map<PhosphorIcon, ReturnType<typeof glyph>>();

function wrapped(Base: PhosphorIcon): ReturnType<typeof glyph> {
  const known = WRAPPED.get(Base);
  if (known) return known;
  const made = glyph(Base);
  WRAPPED.set(Base, made);
  return made;
}

export function LayerTypeIcon({ tag, className }: { tag: string; className?: string }) {
  const Glyph = wrapped(BY_TAG[tag] ?? Square);
  return <Glyph className={className} aria-hidden />;
}
