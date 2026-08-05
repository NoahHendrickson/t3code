/**
 * The design panel's field glyphs, named for what they MEAN in the panel rather than for
 * the Phosphor shape they happen to use — so a swap of glyph is a one-line change here and
 * the panel keeps reading as design vocabulary ("GapIcon", not "ArrowsInLineHorizontal").
 *
 * Straight from `@phosphor-icons/react`, not through the fork's lucide→duotone shim
 * (`custom/icons/lucide-phosphor.tsx`): that shim exists to redirect upstream's lucide
 * imports, and duotone's filled counter reads as mud at the 16px a dense properties panel
 * uses. These are pinned to `regular`, matching the panel's Figma spec
 * (t3-fork file, page V2, node 193:9686).
 */
import {
  AlignBottom,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignLeft,
  AlignRight,
  AlignTop,
  ArrowDown,
  ArrowElbowDownRight,
  ArrowRight,
  ArrowsIn,
  ArrowsInLineHorizontal,
  ArrowsInLineVertical,
  ArrowsOut,
  ArrowsOutLineHorizontal,
  ArrowsOutLineVertical,
  CircleHalf,
  CornersOut,
  FrameCorners,
  GridFour,
  LineSegment,
  LineSegments,
  LinkSimple,
  LinkSimpleBreak,
  PaintBrush,
  PaintBucket,
  Minus,
  Plus,
  PushPin,
  Selection,
  TextAa,
  TextAlignCenter,
  TextAlignJustify,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextT,
  type Icon as PhosphorIcon,
  type IconProps,
} from "@phosphor-icons/react";

/** Pins the panel's weight while leaving size to the caller's `size-*` class. Exported so
 * every fork surface that draws design-mode chrome (the layers rail's type glyphs, the
 * canvas strip) pins the same weight instead of re-deriving it. */
export function glyph(Base: PhosphorIcon) {
  const Wrapped = (props: IconProps) => <Base weight="regular" {...props} />;
  Wrapped.displayName = `Panel(${Base.displayName ?? "Icon"})`;
  return Wrapped;
}

// Position — the align row and the absolute toggle.
export const AlignHStartIcon = glyph(AlignLeft);
export const AlignHCenterIcon = glyph(AlignCenterHorizontal);
export const AlignHEndIcon = glyph(AlignRight);
export const AlignVStartIcon = glyph(AlignTop);
export const AlignVCenterIcon = glyph(AlignCenterVertical);
export const AlignVEndIcon = glyph(AlignBottom);
export const AbsolutePositionIcon = glyph(PushPin);

// Layout.
export const AutoLayoutIcon = glyph(GridFour);
export const DirectionRowIcon = glyph(ArrowRight);
export const DirectionColumnIcon = glyph(ArrowDown);
export const GapRowIcon = glyph(ArrowsInLineHorizontal);
export const GapColumnIcon = glyph(ArrowsInLineVertical);
export const AspectLockedIcon = glyph(LinkSimple);
export const AspectUnlockedIcon = glyph(LinkSimpleBreak);
export const WrapIcon = glyph(ArrowElbowDownRight);
export const GrowIcon = glyph(ArrowsOut);
export const ShrinkIcon = glyph(ArrowsIn);

// Appearance.
export const OpacityIcon = glyph(CircleHalf);
export const RadiusIcon = glyph(FrameCorners);
export const PerCornerIcon = glyph(CornersOut);

// Typography.
export const FontSizeIcon = glyph(TextAa);
export const FontWeightIcon = glyph(TextB);
export const LineHeightIcon = glyph(ArrowsOutLineVertical);
export const LetterSpacingIcon = glyph(ArrowsOutLineHorizontal);
export const TextColorIcon = glyph(TextT);
export const TextAlignLeftIcon = glyph(TextAlignLeft);
export const TextAlignCenterIcon = glyph(TextAlignCenter);
export const TextAlignRightIcon = glyph(TextAlignRight);
export const TextAlignJustifyIcon = glyph(TextAlignJustify);

// Canvas strip. Not through the lucide→duotone shim: the strip sits inside the panel, and
// mixing weights there reads as two different toolbars (PR #57 review).
export const CanvasIcon = glyph(Selection);
export const ZoomOutIcon = glyph(Minus);
export const ZoomInIcon = glyph(Plus);
export const ZoomFitIcon = glyph(ArrowsOut);

// Fill and stroke.
export const FillIcon = glyph(PaintBucket);
export const StrokeWidthIcon = glyph(LineSegment);
export const StrokeStyleIcon = glyph(LineSegments);
export const StrokeColorIcon = glyph(PaintBrush);
