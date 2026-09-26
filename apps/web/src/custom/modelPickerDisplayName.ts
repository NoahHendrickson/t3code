import { PROVIDER_DISPLAY_NAMES, ProviderDriverKind } from "@t3tools/contracts";

/**
 * Model families a provider resells under their maker's name. Cursor lists
 * Anthropic's models as "Claude Opus 5.5"; its logo already marks the row as
 * Cursor's, so the family name goes too.
 */
const RESOLD_FAMILY_NAMES: Partial<Record<ProviderDriverKind, ReadonlyArray<string>>> = {
  [ProviderDriverKind.make("cursor")]: ["Claude"],
};

/**
 * Drops a leading provider name from a model name ("Claude Fable 5.1" →
 * "Fable 5.1") wherever the provider is already shown beside it: the composer
 * trigger's icon, a provider submenu, or a row's provider label. Matches the
 * standard provider name, the instance's own (custom account) name, and any
 * family the provider resells.
 */
export function stripProviderName(
  name: string,
  provider: { driverKind: ProviderDriverKind; displayName?: string | undefined },
): string {
  for (const providerName of [
    PROVIDER_DISPLAY_NAMES[provider.driverKind],
    provider.displayName,
    ...(RESOLD_FAMILY_NAMES[provider.driverKind] ?? []),
  ]) {
    const prefix = providerName?.trim().toLowerCase();
    if (prefix && name.toLowerCase().startsWith(`${prefix} `)) {
      return name.slice(prefix.length).trim() || name;
    }
  }
  return name;
}
