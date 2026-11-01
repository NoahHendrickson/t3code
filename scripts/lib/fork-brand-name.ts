/**
 * Fork display-name rewrite — see `.fork/customizations.yaml#fork-brand-name`.
 *
 * Upstream writes "T3 Code" inline in hundreds of strings and adds more every
 * sync. Rewriting them at build time keeps every one of those files untouched,
 * so the brand stays consistent without a conflict surface the size of the app.
 */

export const FORK_DISPLAY_NAME = "no3y Code";

// Kept as written: the fork's credit ("fork of T3 Code"), prose about upstream, the
// Linux capture extension's own name ("T3 Code SnapShots", "the T3 Code extension"),
// and the server-issued "T3 Code · <label>" session name a revoke prompt quotes.
const UPSTREAM_DISPLAY_NAME =
  /(?<![Ff]ork of |[Uu]pstream )T3 Code\b(?! SnapShots| (?:GNOME )?extension| ·)/g;

export function rewriteUpstreamDisplayName(code: string): string | null {
  if (!code.includes("T3 Code")) {
    return null;
  }
  const rewritten = code.replace(UPSTREAM_DISPLAY_NAME, FORK_DISPLAY_NAME);
  return rewritten === code ? null : rewritten;
}

const SCRIPT_MODULE = /\.[cm]?[jt]sx?$/u;

export interface ForkBrandNameOptions {
  /** Absolute module ids whose "T3 Code" is an identity, not a display name. */
  readonly exclude?: readonly RegExp[];
}

export function forkBrandName(options: ForkBrandNameOptions = {}) {
  const exclude = options.exclude ?? [];
  return {
    name: "fork:brand-name",
    // Upstream's own tests assert upstream's copy; only built and served code is rebranded.
    apply: () => process.env.VITEST === undefined,
    transform(code: string, id: string) {
      const path = id.split("?", 1)[0] ?? id;
      if (
        !SCRIPT_MODULE.test(path) ||
        path.includes("/node_modules/") ||
        exclude.some((pattern) => pattern.test(path))
      ) {
        return null;
      }
      const rewritten = rewriteUpstreamDisplayName(code);
      // Same-line substitutions only, so the incoming source map stays line-accurate.
      return rewritten === null ? null : { code: rewritten, map: null };
    },
    transformIndexHtml(html: string) {
      return rewriteUpstreamDisplayName(html) ?? html;
    },
  };
}
