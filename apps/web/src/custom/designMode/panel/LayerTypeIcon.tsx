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

export function LayerTypeIcon({ tag, className }: { tag: string; className?: string }) {
  const Glyph = BY_TAG[tag] ?? Square;
  return <Glyph weight="regular" className={className} aria-hidden />;
}
