/**
 * The fork's display name — see `.fork/customizations.yaml#fork-app-identity`.
 *
 * The packaged desktop build injects this same name through `desktopBridge`,
 * so this constant only decides what a build with no bridge shows: `vp dev`,
 * the hosted web app, and any renderer that loads before the bridge answers.
 * Upstream's fallback is "T3 Code", which meant the fork's own dev sessions
 * carried upstream's name in the sidebar while the installed app carried this
 * one — the exact ambiguity the rename exists to remove.
 *
 * Kept here rather than inline in `branding.ts` so the string the fork is
 * actually named by lives in fork-owned code, and the edit upstream carries is
 * a single reference.
 */
export const FORK_APP_BASE_NAME = "no3y Code";
