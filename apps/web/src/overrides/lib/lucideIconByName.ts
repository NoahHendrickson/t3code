// Fork shadow of upstream lucideIconByName — see
// `.fork/customizations.yaml#phosphor-duotone-icons`.
//
// "lucide-react" is the Phosphor shim here, which exports each icon under its
// lucide name with an `Icon` suffix, not lucide's bare names. Upstream resolves
// a saved name against the module's exports; this resolves it against the
// shim's `icons` record, so every offered name renders.
import { icons, type LucideIcon } from "lucide-react";

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

export const lucideIconNames: ReadonlyArray<string> = Object.keys(icons).map(toKebabName);

export function lucideIconByName(name: string): LucideIcon | undefined {
  const pascalName = toPascalName(name);
  return icons[LEGACY_NAMES[pascalName] ?? pascalName];
}
