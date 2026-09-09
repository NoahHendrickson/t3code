/**
 * fork: `lucide-react/dynamic` -> the Phosphor shim, by name.
 *
 * Upstream's project icons (#9137) pick a lucide icon by its kebab-case name
 * at runtime through `DynamicIcon`, and list every lucide name through
 * `iconNames`. This module answers both from the shim's own table, so a
 * project icon is drawn by the same Phosphor glyph the rest of the app uses
 * for that name, and the picker only offers names that will actually render.
 * A stored name the table does not know falls back to the folder glyph rather
 * than a blank slot.
 *
 * Aliased alongside `lucide-react` in `apps/web/vite.config.ts` and
 * `tsconfig.json`; see `.fork/customizations.yaml#phosphor-duotone-icons`.
 */
import type { ComponentType } from "react";

import * as shim from "./lucide-phosphor";
import type { LucideIcon, LucideProps } from "./lucide-phosphor";

/** Kebab-case lucide icon name. lucide types this as a union of every icon;
 *  the shim's table is the catalog here, so a plain string keeps callers
 *  (stored project icons, `as IconName` casts) compiling unchanged. */
export type IconName = string;

const toIconName = (exportName: string): string =>
  exportName
    .slice(0, -"Icon".length)
    .replace(/(?<!^)(?=[A-Z])/gu, "-")
    .replace(/([a-z])(\d)/gu, "$1-$2")
    .toLowerCase();

const ICONS_BY_NAME: ReadonlyMap<string, LucideIcon> = new Map(
  Object.entries(shim)
    .filter(
      (entry): entry is [string, LucideIcon] =>
        entry[0].endsWith("Icon") && typeof entry[1] === "function",
    )
    .map(([exportName, component]) => [toIconName(exportName), component]),
);

export const iconNames: ReadonlyArray<IconName> = [...ICONS_BY_NAME.keys()].sort();

export function DynamicIcon({
  name,
  fallback,
  ...props
}: LucideProps & { name: IconName; fallback?: ComponentType<LucideProps> | undefined }) {
  const Icon = ICONS_BY_NAME.get(name) ?? fallback ?? shim.FolderIcon;
  return <Icon {...props} />;
}
