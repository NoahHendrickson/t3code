import { ProviderDriverKind } from "@t3tools/contracts";

/**
 * Model families whose maker is already shown beside the row, per provider.
 * Claude's catalogue repeats its own name ("Claude Opus 5.5"), and Cursor
 * lists Anthropic's models under it too; both logos already mark the row, so
 * the family name goes. Providers whose family word carries the model's
 * identity (Grok's "Grok Build", "Grok 4.6") are deliberately absent: strip
 * "Grok" and only "Build" is left.
 */
const SHOWN_FAMILY_NAMES: Partial<Record<ProviderDriverKind, ReadonlyArray<string>>> = {
  [ProviderDriverKind.make("claudeAgent")]: ["Claude"],
  [ProviderDriverKind.make("cursor")]: ["Claude"],
};

/**
 * Drops a leading provider name from a model name ("Claude Fable 5.1" →
 * "Fable 5.1") wherever the provider is already shown beside it: the composer
 * trigger's icon, a provider submenu, or a row's provider label. Matches the
 * families listed for the provider and the instance's own (custom account)
 * name.
 */
export function stripProviderName(
  name: string,
  provider: { driverKind: ProviderDriverKind; displayName?: string | undefined },
): string {
  for (const providerName of [
    ...(SHOWN_FAMILY_NAMES[provider.driverKind] ?? []),
    provider.displayName,
  ]) {
    const prefix = providerName?.trim().toLowerCase();
    if (prefix && name.toLowerCase().startsWith(`${prefix} `)) {
      return name.slice(prefix.length).trim() || name;
    }
  }
  return name;
}
