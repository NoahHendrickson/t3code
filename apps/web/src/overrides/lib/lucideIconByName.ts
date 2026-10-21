// Fork shadow of upstream lucideIconByName — see
// `.fork/customizations.yaml#phosphor-duotone-icons`.
//
// "lucide-react" is the Phosphor shim here. Its catalog is every `*Icon` export,
// aliases included, as the fork's picker has always offered: a project icon
// saved under an alias (more-horizontal, x-circle) must keep resolving.
import * as shim from "~/custom/icons/lucide-phosphor";
import type { LucideIcon } from "~/custom/icons/lucide-phosphor";

const ICONS_BY_PASCAL_NAME: ReadonlyMap<string, LucideIcon> = new Map(
  Object.entries(shim)
    .filter(
      (entry): entry is [string, LucideIcon] =>
        /^[A-Z]\w*Icon$/u.test(entry[0]) && typeof entry[1] === "function",
    )
    .map(([exportName, component]) => [exportName.slice(0, -"Icon".length), component]),
);

// Deprecated lucide names an older project icon override may have saved.
const LEGACY_NAMES: Readonly<Record<string, string>> = { AlarmCheck: "AlarmClockCheck" };

function toPascalName(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// Inverse of toPascalName: "ArrowDown01" -> "arrow-down-01".
function toKebabName(pascalName: string): string {
  return (pascalName.match(/[A-Z][a-z]*|[0-9]+[a-z]*/g) ?? []).join("-").toLowerCase();
}

export const lucideIconNames: ReadonlyArray<string> = [...ICONS_BY_PASCAL_NAME.keys()]
  .map(toKebabName)
  .sort();

export function lucideIconByName(name: string): LucideIcon | undefined {
  const pascalName = toPascalName(name);
  return ICONS_BY_PASCAL_NAME.get(LEGACY_NAMES[pascalName] ?? pascalName);
}
