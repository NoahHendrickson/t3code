import { PROVIDER_DISPLAY_NAMES, ProviderDriverKind } from "@t3tools/contracts";

/**
 * Model families whose maker is already shown beside the row, per provider.
 * Claude's catalogue repeats its own name ("Claude Opus 5.5"), and Cursor
 * lists Anthropic's models under it too; both logos already mark the row, so
 * the family name goes. Where the logo is hidden, triggerModelName names the
 * reseller instead. Providers whose family word carries the model's
 * identity (Grok's "Grok Build", "Grok 4.6") are deliberately absent: strip
 * "Grok" and only "Build" is left.
 */
const SHOWN_FAMILY_NAMES: Partial<Record<ProviderDriverKind, ReadonlyArray<string>>> = {
  [ProviderDriverKind.make("claudeAgent")]: ["Claude"],
  [ProviderDriverKind.make("cursor")]: ["Claude"],
};

/** Providers that resell another maker's models; named wherever their icon isn't shown. */
const RESELLERS: ReadonlySet<ProviderDriverKind> = new Set([ProviderDriverKind.make("cursor")]);

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

/**
 * The model picker trigger's name for a model. Without its icon, a reseller
 * leads with its own name: Cursor's "Opus 5.5" would otherwise read as
 * Claude's own, so it reads "Cursor Opus 5.5".
 */
export function triggerModelName(
  name: string,
  provider: { driverKind: ProviderDriverKind; displayName?: string | undefined } | null | undefined,
  { iconShown }: { iconShown: boolean },
): string {
  if (!provider) return name;
  const stripped = stripProviderName(name, provider);
  return !iconShown && RESELLERS.has(provider.driverKind)
    ? `${PROVIDER_DISPLAY_NAMES[provider.driverKind] ?? provider.driverKind} ${stripped}`
    : stripped;
}
