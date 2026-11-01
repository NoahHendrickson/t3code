/**
 * Fork display-name rewrite — see `.fork/customizations.yaml#fork-brand-name`.
 *
 * Upstream writes "T3 Code" inline in hundreds of strings and adds more every
 * sync. Rewriting them at build time keeps every one of those files untouched,
 * so the brand stays consistent without a conflict surface the size of the app.
 */

import type { Plugin } from "vite-plus";

export const FORK_DISPLAY_NAME = "no3y Code";

/** Phrases that name something other than this app, kept exactly as written. */
export const PRESERVED_PHRASES = [
  // The fork's credit, and prose about upstream itself.
  "Fork of T3 Code",
  "fork of T3 Code",
  "upstream T3 Code",
  // The Linux capture extension ships under its upstream name.
  "T3 Code SnapShots",
  "T3 Code GNOME extension",
  "T3 Code extension",
  // Upstream's registered GitHub App, whose install URL still names it.
  "T3 Code for GitHub",
  // The server issues peer-link sessions as "T3 Code · <label>"; a revoke prompt quotes it.
  "T3 Code · ",
] as const;

/** Modules whose "T3 Code" strings are identities (legacy profile names, dictation vocabulary). */
export const EXCLUDED_MODULES = [
  /\/apps\/desktop\/src\/app\/DesktopUserData\.ts$/u,
  /\/apps\/desktop\/src\/fork\/voice\/LocalSpeechEngine\.ts$/u,
] as const;

const UPSTREAM_DISPLAY_NAME = "T3 Code";
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const PRESERVED_OR_NAME = new RegExp(
  [...PRESERVED_PHRASES, UPSTREAM_DISPLAY_NAME].map(escapeRegExp).join("|"),
  "gu",
);

export function rewriteUpstreamDisplayName(code: string): string | null {
  if (!code.includes(UPSTREAM_DISPLAY_NAME)) {
    return null;
  }
  const rewritten = code.replace(PRESERVED_OR_NAME, (match) =>
    match === UPSTREAM_DISPLAY_NAME ? FORK_DISPLAY_NAME : match,
  );
  return rewritten === code ? null : rewritten;
}

const SCRIPT_MODULE = /\.[cm]?[jt]sx?$/u;

export function forkBrandName(): Plugin {
  return {
    name: "fork:brand-name",
    transform(code, id) {
      const path = id.split("?", 1)[0] ?? id;
      if (
        !SCRIPT_MODULE.test(path) ||
        path.includes("/node_modules/") ||
        EXCLUDED_MODULES.some((pattern) => pattern.test(path))
      ) {
        return null;
      }
      const rewritten = rewriteUpstreamDisplayName(code);
      // Replacements never add or remove lines, so mappings stay line-accurate; columns drift.
      return rewritten === null ? null : { code: rewritten, map: null };
    },
    transformIndexHtml(html) {
      return rewriteUpstreamDisplayName(html) ?? html;
    },
  };
}
