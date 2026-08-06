// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/README.md` §4b and `.fork/customizations.yaml#fork-design-mode`.
 *
 * The design mode's outcome contract, from the outside in:
 *   - the toggle is wired into the preview chrome and the panel is docked by an override;
 *   - the engine bundler plugin is registered and the engine TS island stays excluded;
 *   - the engine bundles to one self-contained IIFE (proves the vendored module graph is
 *     complete after any upstream sync or Forge re-sync);
 *   - the engine keeps ZERO network delivery — T3 threads are the only delivery surface,
 *     so a Forge re-sync that drags /__the-forge/* fetches back in must fail here;
 *   - the console-message protocol round-trips.
 */

import {
  PREVIEW_VIEWPORT_MAX_AREA,
  PREVIEW_VIEWPORT_MAX_DIMENSION,
  PREVIEW_VIEWPORT_MIN_DIMENSION,
} from "@t3tools/contracts";
import { build } from "esbuild";
import * as NodeBuffer from "node:buffer";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  extractTrailingDesignChanges,
  summarizeDesignChangeBlock,
} from "../custom/designMode/designChangeTranscript";
import { resolveBrowserDeviceViewportArea } from "../browser/browserViewportLayout";
import {
  CANVAS_RESOLUTIONS,
  resolutionForViewport,
  viewportAtTrueSize,
  viewportFillingPane,
} from "../custom/designMode/panel/canvasResolutions";
import { FORK_MARKER_ATTRIBUTE, FORK_MARKER_VALUE } from "../custom/forkMarker";
import { cssRules } from "./cssRules";
import {
  capPageUrl,
  DESIGN_MODE_CONSOLE_PREFIX,
  DESIGN_MODE_GLOBAL,
  DESIGN_MODE_LAYERS_MAX_DEPTH,
  DESIGN_MODE_PAGE_URL_CAP,
  DESIGN_MODE_STYLE_KEYS,
  parseDesignChangeRequestPayload,
  parseDesignModeConsoleMessage,
} from "../custom/designMode/protocol";

const webRoot = NodePath.resolve(NodeURL.fileURLToPath(new URL(".", import.meta.url)), "../..");
const read = (relative: string) => NodeFS.readFileSync(NodePath.join(webRoot, relative), "utf8");
/** Every fork theme rule is scoped under this; an unscoped one leaks into upstream. Derived
 * from the marker module rather than hardcoded, like the sibling theme guards. */
const FORK_MARKER = `[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`;

describe("fork guard: design mode", () => {
  it("mounts the Design toggle and the native panel in the preview pane", () => {
    const previewView = read("src/components/preview/PreviewView.tsx");
    const previewPanel = read("src/overrides/components/preview/PreviewPanel.tsx");
    expect(previewView).toContain(
      'import { ForkPreviewDesignMode } from "~/custom/designMode/ForkPreviewDesignMode"',
    );
    expect(previewView).toContain("<ForkPreviewDesignMode");
    expect(previewView).not.toContain("ForkDesignPanel");
    expect(previewPanel).toContain(
      'import { ForkDesignPanel } from "~/custom/designMode/panel/ForkDesignPanel"',
    );
    // Prefix, not the whole tag: the panel may take further props over time, and this
    // guard is about the mount.
    expect(previewPanel).toContain(
      "<ForkDesignPanel runtimeTabId={runtimeTabId} threadRef={threadRef}",
    );
    // Layers rail docks in the same override, left of the untouched preview surface.
    expect(previewPanel).toContain("<ForkLayersTree runtimeTabId={runtimeTabId} />");
    expect(previewView).not.toContain("ForkLayersTree");
  });

  it("commits the screen's real width and derives a height that fills the pane", () => {
    // The whole point: the guest's CSS viewport width IS the screen's, so a page that hides
    // content below a breakpoint sees the screen and not however wide the pane happens to
    // be. The height is derived instead so upstream's fit lands 1:1 on both axes and the
    // frame fills the preview area — a fixed screen height would letterbox it.
    const pane = { width: 1100, height: 1650 };
    const area = resolveBrowserDeviceViewportArea(pane);
    for (const resolution of CANVAS_RESOLUTIONS) {
      const setting = viewportFillingPane(resolution, pane);
      expect(setting._tag).toBe("freeform");
      expect(setting.width).toBe(resolution.width);
      // Same aspect ratio as the fit area, so nothing is letterboxed (within rounding) —
      // unless the contract's area cap bit first, which it does for the widest screens in a
      // tall pane. That letterbox is honest: the alternative is a refused resize.
      const ceiling = Math.floor(PREVIEW_VIEWPORT_MAX_AREA / resolution.width);
      if (setting.height < ceiling) {
        expect(setting.height / setting.width).toBeCloseTo(area.height / area.width, 2);
      }
      // ...and always a size the contract will accept, or the commit toasts instead.
      expect(setting.width).toBeLessThanOrEqual(PREVIEW_VIEWPORT_MAX_DIMENSION);
      expect(setting.height).toBeGreaterThanOrEqual(PREVIEW_VIEWPORT_MIN_DIMENSION);
      expect(setting.height).toBeLessThanOrEqual(PREVIEW_VIEWPORT_MAX_DIMENSION);
      expect(setting.width * setting.height).toBeLessThanOrEqual(PREVIEW_VIEWPORT_MAX_AREA);
    }
    // A tall pane at the widest screen is the case that would blow the area cap.
    const widest = CANVAS_RESOLUTIONS.reduce((a, b) => (b.width > a.width ? b : a));
    const clamped = viewportFillingPane(widest, { width: 400, height: 4000 });
    expect(clamped.width * clamped.height).toBeLessThanOrEqual(PREVIEW_VIEWPORT_MAX_AREA);
    // Unmeasured pane falls back to the screen's own height rather than something absurd.
    const unmeasured = viewportFillingPane(widest, null);
    expect(unmeasured.height).toBe(widest.height);
    // True height frames the screen verbatim on both axes — the fold is the whole point of
    // the switch, so the pane must not get a say in the height.
    for (const resolution of CANVAS_RESOLUTIONS) {
      const framed = viewportAtTrueSize(resolution);
      expect(framed).toEqual({
        _tag: "freeform",
        width: resolution.width,
        height: resolution.height,
      });
    }
    // Off by default, and flipping it re-commits the applied screen rather than waiting for
    // the next pick — otherwise the switch reads as broken.
    const menu = read("src/custom/designMode/panel/ScreenSizeMenu.tsx");
    expect(/const TRUE_HEIGHT_STORAGE_KEY = "([^"]+)"/u.exec(menu)?.[1]).toMatch(
      /^t3code:fork:[a-z-]+:v\d+$/u,
    );
    expect(menu).toContain("TRUE_HEIGHT_STORAGE_KEY,\n    false,");
    expect(menu).toContain(
      "if (activeResolution) commitCanvasViewport(runtimeTabId, viewportFor(activeResolution, next));",
    );

    // Widths are the identity the panel matches an applied viewport back by.
    const widths = CANVAS_RESOLUTIONS.map((r) => r.width);
    expect(new Set(widths).size).toBe(widths.length);
    // Identity is width AND a height this menu could have produced — a hand-typed viewport
    // that merely shares a catalog width must NOT be claimed, or True height would re-commit
    // over it and discard the height the user set.
    expect(resolutionForViewport(viewportAtTrueSize(widest), pane)).toEqual(widest);
    expect(resolutionForViewport(viewportFillingPane(widest, pane), pane)).toEqual(widest);
    expect(
      resolutionForViewport({ _tag: "freeform", width: widest.width, height: 700 }, pane),
    ).toBeNull();
    // A `preset` viewport is upstream's device toolbar's, never ours — the legacy catalog's
    // desktop-1920x1080 shares a width with the 24" entry.
    expect(
      resolutionForViewport(
        { _tag: "preset", width: 1920, height: 1080, presetId: "desktop-1920x1080" },
        pane,
      ),
    ).toBeNull();
  });

  it("keeps a way back out of the collapsed layers rail", () => {
    // A one-way door is the failure mode: collapsed, the rail renders nothing, so the only
    // control that reopens it would go with it. It moves to the chrome row's leading slot
    // instead — which means the flag has to be shared state, not the rail's own.
    const rail = read("src/custom/designMode/ForkLayersTree.tsx");
    const toggle = read("src/custom/designMode/ForkPreviewLayersToggle.tsx");
    const shared = read("src/custom/designMode/layersCollapsed.ts");
    expect(/const LAYERS_COLLAPSED_STORAGE_KEY = "([^"]+)"/u.exec(shared)?.[1]).toMatch(
      /^t3code:fork:[a-z-]+:v\d+$/u,
    );
    // Both halves read the same hook; a local useState in either would desync them.
    for (const source of [rail, toggle]) {
      expect(source).toContain('from "./layersCollapsed"');
      expect(source).not.toContain("useState(false)");
    }
    // The two always-mounted readers select a PRIMITIVE. The tab object's identity churns on
    // every selection/layers/tokens patch — up to ~4/s while an agent edits the page — and
    // both of these care about one transition. (The inner LayersRail does take the whole
    // tab, correctly: it renders it, and only exists while the rail is open.)
    // One availability predicate, not two: the copies had already drifted (the toggle's was
    // missing the runtimeTabId half, harmless only by accident of the empty-tab default).
    for (const source of [rail, toggle]) expect(source).toContain("layersRailAvailable(");
    // Each half unmounts ITSELF on activation, so each hands focus to its counterpart —
    // otherwise a keyboard user lands on <body> and tabs in from the top of the document.
    expect(rail).toContain("focusLayersControl(LAYERS_SHOW_BUTTON)");
    expect(toggle).toContain("focusLayersControl(LAYERS_HIDE_BUTTON)");
    // A disclosure pair: both point aria-controls at the rail they govern.
    for (const source of [rail, toggle]) expect(source).toContain("aria-controls={LAYERS_RAIL_ID}");
    // A gate component, not an early return inside the body: the rail's flatten/filter/
    // reveal machinery re-runs on every debounced layers re-emit, and hiding its output
    // while leaving it subscribed would burn that work for a rail the user closed.
    expect(rail).toContain("if (collapsed || !available || !runtimeTabId) return null;");
    expect(rail).toContain("function LayersRail(");
    expect(rail).toContain('aria-label="Hide layers"');
    expect(toggle).toContain('aria-label="Show layers"');
    expect(toggle).toContain("setCollapsed(false)");
    // ...and the slot it mounts into exists on the chrome row and is actually passed.
    const chromeRow = read("src/components/preview/PreviewChromeRow.tsx");
    expect(chromeRow).toContain("leadingActions?: ReactNode;");
    expect(chromeRow).toContain("{leadingActions}");
    expect(read("src/components/preview/PreviewView.tsx")).toContain(
      "leadingActions={<ForkPreviewLayersToggle runtimeTabId={runtimeTabId} />}",
    );
  });

  it("continues the guest's canvas across the host letterbox in the same color", () => {
    // Two surfaces draw one canvas: the guest paints its <html> from CANVAS_BG, and the
    // host paints the area the fit-scaled webview does not cover. Different values are a
    // visible seam around the artboard, and nothing else would catch the drift.
    const guest = read("src/custom/designMode/engine/vendor/canvas.ts");
    const canvasBg = /export const CANVAS_BG = '([^']+)'/u.exec(guest)?.[1];
    expect(canvasBg).toBeDefined();
    const rules = cssRules(read("src/theme.custom.css"));
    const token = rules.find((rule) => rule.body.includes("--fork-design-canvas:"));
    expect(token?.selector).toContain(FORK_MARKER);
    expect(token?.body).toContain(`--fork-design-canvas: ${canvasBg};`);
    // The surround only exists while canvas mode is on — a fixed viewport without it is
    // upstream's plain device preview.
    const surround = rules.find((rule) => rule.selector.includes("[data-preview-viewport]"));
    expect(surround?.selector).toContain(FORK_MARKER);
    expect(surround?.selector).toContain('[data-fork-canvas="on"]');
    expect(surround?.body).toContain("background-color: var(--fork-design-canvas)");
    // The wrapper, NOT the surface slot beneath it: the wrapper is `fixed`, z-30 and carries
    // its own translucent `bg-muted/35`, so anything painted under it is tinted rather than
    // shown — in light mode that seam ring is ~#7d7d7d against #3c3c3c. It also mounts under
    // ElectronBrowserHost, outside the preview panel's subtree, so a descendant selector
    // rooted at the panel could never have reached it.
    const host = read("src/browser/HostedBrowserWebview.tsx");
    expect(host).toContain('className="fixed overflow-hidden bg-muted/35"');
    expect(host).toContain('data-fork-canvas={canvasOn ? "on" : undefined}');
    expect(host).toContain("fork:begin fork-design-mode");
  });

  it("wires every guest-handle verb from the protocol through boot and the host bridge", () => {
    // The drift this catches: a verb declared in DesignModeGuestHandle but never installed on
    // the page global (the panel's call silently no-ops) or never given a bridge wrapper (no
    // way for the panel to call it at all). Both halves have to move with the contract.
    const protocol = read("src/custom/designMode/protocol.ts");
    const body = /export interface DesignModeGuestHandle \{([\s\S]*?)\n\}/u.exec(protocol)?.[1];
    expect(body).toBeDefined();
    const verbs = [...(body ?? "").matchAll(/^ {2}(\w+)[(<]/gmu)].map((match) => match[1]);
    expect(verbs).toContain("alignSelection");
    expect(verbs.length).toBeGreaterThan(10);

    const boot = read("src/custom/designMode/engine/boot.ts");
    const bridge = read("src/custom/designMode/designModeBridge.ts");
    // `isActive` is the guest's own predicate — the host tracks enablement in its store.
    const guestOnly = new Set(["isActive"]);
    for (const verb of verbs) {
      expect(boot, `boot.ts installs ${verb}`).toContain(`${verb}:`);
      if (guestOnly.has(verb ?? "")) continue;
      expect(bridge, `designModeBridge.ts calls ${verb}`).toContain(`"${verb}"`);
    }
  });

  it("delivers design changes as composer attachments, not prompt text", () => {
    const chatComposer = read("src/components/chat/ChatComposer.tsx");
    expect(chatComposer).toContain(
      'import { ForkComposerDesignChanges } from "~/custom/designMode/ForkComposerDesignChanges"',
    );
    expect(chatComposer).toContain("<ForkComposerDesignChanges target={composerDraftTarget}");
    // Pill-only sendability: the button's own sendState memo counts pending attachments.
    expect(chatComposer).toContain(
      "const forkPendingDesignChangeCount = useForkPendingDesignChangeCount(composerDraftTarget)",
    );
    expect(chatComposer).toContain("forkPendingDesignChangeCount,");
    const chatView = read("src/components/ChatView.tsx");
    expect(chatView).toContain(
      'import { forkDesignChanges } from "~/custom/designMode/designChangeDraftStore"',
    );
    expect(chatView).toContain("forkDesignChanges.count({ environmentId, threadId:");
    expect(chatView).toContain("forkDesignChanges.appendToPrompt(");
    expect(chatView).toContain(
      "messageTextForSendWithDesignChanges || IMAGE_ONLY_BOOTSTRAP_PROMPT",
    );
    expect(chatView).toContain(
      "if (turnStartSucceeded) forkDesignChanges.clear(forkDesignChangeRef)",
    );
  });

  it("renders sent design changes as transcript chips, not raw markdown", () => {
    const timeline = read("src/components/chat/MessagesTimeline.tsx");
    expect(timeline).toContain(
      'import { extractTrailingDesignChanges } from "~/custom/designMode/designChangeTranscript"',
    );
    expect(timeline).toContain(
      "const forkDesignChanges = extractTrailingDesignChanges(row.message.text)",
    );
    expect(timeline).toContain("<ForkTranscriptDesignChanges blocks={forkDesignChanges.blocks} />");
    // Extraction round-trip: blocks are the outermost trailing run and strip cleanly,
    // restoring the position the upstream element/terminal extractors rely on.
    const markdown = "# Design change request\n\n## 1. <button> — src/App.tsx:5:3\n- x";
    const prompt = `make it pop\n\n<design_change_request>\n${markdown}\n</design_change_request>`;
    const extracted = extractTrailingDesignChanges(prompt);
    expect(extracted.promptText).toBe("make it pop");
    expect(extracted.blocks).toEqual([markdown]);
    expect(summarizeDesignChangeBlock(markdown)).toEqual({
      elementCount: 1,
      firstLabel: "<button> — src/App.tsx:5:3",
    });
    expect(extractTrailingDesignChanges("no blocks here").blocks).toEqual([]);
  });

  it("registers the engine bundler plugin and serves the virtual module", () => {
    const viteConfig = read("vite.config.ts");
    expect(viteConfig).toContain(
      'import { forkDesignModeEngine } from "./fork/vitePluginForkDesignMode"',
    );
    expect(viteConfig).toContain("forkDesignModeEngine({");
    const plugin = read("fork/vitePluginForkDesignMode.ts");
    expect(plugin).toContain('"virtual:fork-design-mode-engine"');
  });

  it("keeps the engine TS island excluded from the web project", () => {
    const tsconfig = read("tsconfig.json");
    expect(tsconfig).toContain('"exclude": ["src/custom/designMode/engine"]');
    expect(
      NodeFS.existsSync(NodePath.join(webRoot, "src/custom/designMode/engine/tsconfig.json")),
    ).toBe(true);
  });

  it("keeps the engine free of network delivery (T3 threads are the delivery surface)", () => {
    const engineDir = NodePath.join(webRoot, "src/custom/designMode/engine");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of NodeFS.readdirSync(dir, { withFileTypes: true })) {
        const absolute = NodePath.join(dir, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (entry.isFile() && entry.name.endsWith(".ts")) {
          const source = NodeFS.readFileSync(absolute, "utf8");
          // Quoted endpoint literals and network constructors — comments that merely
          // mention the removed delivery layer are fine; call sites are not.
          if (
            source.includes("'/__the-forge") ||
            source.includes('"/__the-forge') ||
            /\bfetch\s*\(/u.test(source) ||
            source.includes("new WebSocket") ||
            source.includes("new EventSource") ||
            source.includes("XMLHttpRequest")
          ) {
            offenders.push(NodePath.relative(webRoot, absolute));
          }
        }
      }
    };
    walk(engineDir);
    expect(offenders).toEqual([]);
  });

  it("bundles the engine into one self-contained injectable IIFE", async () => {
    const result = await build({
      entryPoints: [NodePath.join(webRoot, "src/custom/designMode/engine/boot.ts")],
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      minify: true,
      write: false,
      logLevel: "silent",
    });
    const code = result.outputFiles[0]?.text ?? "";
    expect(code.length).toBeGreaterThan(50_000);
    expect(code).toContain(DESIGN_MODE_CONSOLE_PREFIX);
    expect(code).toContain(DESIGN_MODE_GLOBAL);
    // The delivery layer must not ride along in any form.
    expect(code).not.toContain("/__the-forge/");
  });

  it("preserves px sizing intent and skips over-depth layers before spending budget", async () => {
    const result = await build({
      stdin: {
        contents: [
          'export { seedFrom } from "./src/custom/designMode/engine/vendor/resize";',
          'export { buildLayerTree } from "./src/custom/designMode/engine/vendor/layers";',
        ].join("\n"),
        resolveDir: webRoot,
        sourcefile: "design-mode-engine-guard.ts",
        loader: "ts",
      },
      bundle: true,
      format: "esm",
      platform: "node",
      target: "es2022",
      write: false,
      logLevel: "silent",
    });
    const code = result.outputFiles[0]?.text ?? "";
    const moduleUrl = `data:text/javascript;base64,${NodeBuffer.Buffer.from(code).toString("base64")}`;
    const engine = (await import(moduleUrl)) as {
      seedFrom: (draft: string | null, measured: string) => number;
      buildLayerTree: (
        root: Element,
        includeUntagged: boolean,
        budget: { left: number; truncated: boolean; exhausted?: boolean },
        maxDepth: number,
      ) => Array<{ el: { id: string }; children: unknown[] }>;
    };

    expect(engine.seedFrom("240px", "600px")).toBe(240);
    expect(engine.seedFrom("100%", "600px")).toBe(600);
    expect(engine.seedFrom("auto", "600px")).toBe(600);

    type FakeElement = {
      tagName: string;
      dataset: { dcSource: string };
      id: string;
      children: FakeElement[];
      childNodes: never[];
    };
    const element = (id: string, children: FakeElement[] = []): FakeElement => ({
      tagName: "DIV",
      dataset: { dcSource: id },
      id,
      children,
      childNodes: [],
    });
    const tooDeep = element("too-deep");
    const root = {
      children: [element("deep-root", [element("deep-child", [tooDeep])]), element("later-peer")],
    } as unknown as Element;
    const budget = { left: 10, truncated: false };
    const layers = engine.buildLayerTree(root, false, budget, 1);

    expect(layers.map((node) => node.el.id)).toEqual(["deep-root", "later-peer"]);
    expect(layers[0]?.children).toHaveLength(1);
    expect(budget).toEqual({ left: 7, truncated: true });
  });

  it("keeps the native source bridge contract aligned across preload and engine", () => {
    // The desktop preload installs the resolver global; the engine consumes it by the
    // same name. A drifted literal on either side silently degrades every untagged React
    // page to selector-only — fail here instead.
    const resolverGlobal = "__T3_DESIGN_SOURCE_RESOLVER_V1__";
    const desktopRoot = NodePath.join(webRoot, "../desktop");
    const preloadResult = NodeFS.readFileSync(
      NodePath.join(desktopRoot, "src/preview/DesignSourceResult.ts"),
      "utf8",
    );
    const engineNativeSource = read("src/custom/designMode/engine/nativeSource.ts");
    expect(preloadResult).toContain(`"${resolverGlobal}"`);
    expect(engineNativeSource).toContain(`"${resolverGlobal}"`);

    // The preload entry must keep the fenced resolver import — an upstream sync that
    // reverts the entry file to its one-line upstream form drops the whole bridge.
    const preloadEntry = NodeFS.readFileSync(
      NodePath.join(desktopRoot, "src/preview-pick-preload.ts"),
      "utf8",
    );
    expect(preloadEntry).toContain("fork:begin fork-design-mode");
    expect(preloadEntry).toContain('import "./preview/DesignSourceResolver.ts"');

    // react-grab stays a desktop-preload dependency only — never bundled into the web app.
    const webPackage = read("package.json");
    expect(webPackage).not.toContain("react-grab");

    // The Forge-install handoff is gone: every page is editable without project setup.
    const designModeToggle = read("src/custom/designMode/ForkPreviewDesignMode.tsx");
    expect(designModeToggle).not.toContain("forge-mode init");
    expect(designModeToggle).not.toContain("SETUP.md");
  });

  it("round-trips and rejects ready messages (source modes)", () => {
    for (const sourceMode of ["forge", "native-react", "selector-only"]) {
      expect(
        parseDesignModeConsoleMessage(
          `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"ready","sourceMode":"${sourceMode}"}`,
        ),
      ).toEqual({ type: "ready", sourceMode });
    }
    // The retired tagged shape and unknown modes reject rather than half-parse.
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"ready","tagged":true}`),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"ready","sourceMode":"psychic"}`,
      ),
    ).toBeNull();
  });

  it("round-trips and rejects canvas messages", () => {
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"canvas","on":true,"scalePercent":125}`,
      ),
    ).toEqual({ type: "canvas", on: true, scalePercent: 125 });
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"canvas","on":false,"scalePercent":100}`,
      ),
    ).toEqual({ type: "canvas", on: false, scalePercent: 100 });
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"canvas","on":"yes","scalePercent":100}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"canvas","on":true}`),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"canvas","on":true,"scalePercent":null}`,
      ),
    ).toBeNull();
  });

  it("round-trips the console-message protocol", () => {
    const styles = Object.fromEntries(DESIGN_MODE_STYLE_KEYS.map((key) => [key, `${key}-value`]));
    const element = {
      id: 1,
      tag: "button",
      sourceLabel: "App.tsx:5",
      styles,
      sizeModes: { width: "fixed", height: "hug" },
      offsets: { x: 24, y: -8 },
      positionState: "flow",
      alignCaps: { horizontal: true, vertical: false },
      drafted: ["padding-top", "gap"],
    };
    const selection = { type: "selection", elements: [element] };
    const line = `${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify(selection)}`;
    expect(parseDesignModeConsoleMessage(line)).toEqual(selection);
    // Every snapshot half is required: a missing or malformed one rejects the whole message
    // rather than half-parsing into a panel that would then read `undefined` as a value.
    const withoutKey = (key: keyof typeof element) => {
      const rest: Record<string, unknown> = { ...element };
      delete rest[key];
      return `${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify({
        type: "selection",
        elements: [rest],
      })}`;
    };
    for (const key of ["sizeModes", "offsets", "positionState", "alignCaps", "drafted"] as const) {
      expect(parseDesignModeConsoleMessage(withoutKey(key))).toBeNull();
    }
    const withPatch = (patch: Record<string, unknown>) =>
      `${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify({
        type: "selection",
        elements: [{ ...element, ...patch }],
      })}`;
    expect(
      parseDesignModeConsoleMessage(withPatch({ sizeModes: { width: "stretchy", height: "hug" } })),
    ).toBeNull();
    expect(parseDesignModeConsoleMessage(withPatch({ positionState: "floating" }))).toBeNull();
    expect(parseDesignModeConsoleMessage(withPatch({ offsets: { x: 1 } }))).toBeNull();
    expect(parseDesignModeConsoleMessage(withPatch({ offsets: { x: 1, y: "2" } }))).toBeNull();
    expect(
      parseDesignModeConsoleMessage(withPatch({ alignCaps: { horizontal: true } })),
    ).toBeNull();
    expect(parseDesignModeConsoleMessage(withPatch({ drafted: [1, 2] }))).toBeNull();
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"drafts","count":3}`),
    ).toEqual({ type: "drafts", count: 3 });
    expect(parseDesignModeConsoleMessage("plain page log")).toBeNull();
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"nope"}`),
    ).toBeNull();
    expect(parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}not-json`)).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"selection","elements":[{"id":1}]}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"drafts","count":"3"}`),
    ).toBeNull();
  });

  it("round-trips and rejects tokens messages", () => {
    const tokens = {
      type: "tokens",
      colors: [{ name: "red-500", value: "oklch(0.637 0.237 25.331)" }],
      spacingBasePx: 4,
    };
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify(tokens)}`),
    ).toEqual(tokens);
    // null spacing base = "not a Tailwind project" — a valid shape, not a rejection.
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"tokens","colors":[],"spacingBasePx":null}`,
      ),
    ).toEqual({ type: "tokens", colors: [], spacingBasePx: null });
    // Rejections: malformed token entry, stringly-typed base, missing colors.
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"tokens","colors":[{"name":"red-500"}],"spacingBasePx":4}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"tokens","colors":[],"spacingBasePx":"4"}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"tokens","spacingBasePx":4}`,
      ),
    ).toBeNull();
  });

  it("round-trips and rejects layers messages, including the depth bound", () => {
    const layers = {
      type: "layers",
      roots: [
        {
          id: 1,
          tag: "div",
          label: "Frame",
          reorderable: false,
          siblingGroup: 0,
          children: [
            {
              id: 2,
              tag: "button",
              label: "Save",
              reorderable: true,
              siblingGroup: 1,
              children: [],
            },
          ],
        },
      ],
      truncated: false,
    };
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify(layers)}`),
    ).toEqual(layers);
    // Rejections: missing label, missing reorderable, missing siblingGroup (the rail's
    // DOM-sibling drop gate), missing truncated, one bad child poisons the message.
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"layers","roots":[{"id":1,"tag":"div","reorderable":false,"siblingGroup":0,"children":[]}],"truncated":false}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"layers","roots":[{"id":1,"tag":"div","label":"Frame","siblingGroup":0,"children":[]}],"truncated":false}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(
        `${DESIGN_MODE_CONSOLE_PREFIX}{"type":"layers","roots":[{"id":1,"tag":"div","label":"Frame","reorderable":false,"children":[]}],"truncated":false}`,
      ),
    ).toBeNull();
    expect(
      parseDesignModeConsoleMessage(`${DESIGN_MODE_CONSOLE_PREFIX}{"type":"layers","roots":[]}`),
    ).toBeNull();
    // Depth bound: a chain one level past the shared bound rejects rather than recursing.
    const chain = (levels: number) => {
      let node: Record<string, unknown> = {
        id: levels,
        tag: "div",
        label: "leaf",
        reorderable: false,
        siblingGroup: 0,
        children: [],
      };
      for (let index = levels - 1; index >= 1; index -= 1) {
        node = {
          id: index,
          tag: "div",
          label: "Frame",
          reorderable: false,
          siblingGroup: 0,
          children: [node],
        };
      }
      return `${DESIGN_MODE_CONSOLE_PREFIX}${JSON.stringify({ type: "layers", roots: [node], truncated: false })}`;
    };
    // Roots are depth 0, so the bound admits MAX_DEPTH + 1 levels and rejects one more.
    expect(parseDesignModeConsoleMessage(chain(DESIGN_MODE_LAYERS_MAX_DEPTH + 1))).not.toBeNull();
    expect(parseDesignModeConsoleMessage(chain(DESIGN_MODE_LAYERS_MAX_DEPTH + 2))).toBeNull();
    // The GUEST serializer must stop at the same bound, or a deep page emits a tree the host
    // rejects wholesale and the layers rail silently never appears (PR #52/#54 review).
    expect(read("src/custom/designMode/engine/layersSession.ts")).toContain(
      "DESIGN_MODE_LAYERS_MAX_DEPTH",
    );
  });

  it("decodes complete design-change payloads only", () => {
    const payload = {
      markdown: "Change button padding",
      elementCount: 1,
      elements: [{ tag: "button", sourceLabel: "App.tsx:5", deltas: ["8px → 12px"] }],
      documentId: "doc-1",
      pageUrl: "http://localhost:5173/",
    };
    expect(parseDesignChangeRequestPayload(payload)).toEqual(payload);
    expect(parseDesignChangeRequestPayload({ ...payload, elementCount: 2 })).toBeNull();
    expect(
      parseDesignChangeRequestPayload({
        ...payload,
        elements: [{ ...payload.elements[0], deltas: [3] }],
      }),
    ).toBeNull();
    // documentId and pageUrl are the composer's replace-vs-append key (designChangeDraftStore),
    // so a payload missing either can't be honored. An engine too old to send them fails the
    // parse here; designModeBridge.buildSend reports that as "stale-engine" and the panel
    // surfaces it (boot()'s version check only rebuilds the engine at the NEXT injection —
    // the toggle or a navigation — never on the Send path).
    const { pageUrl: _omitted, ...withoutPage } = payload;
    expect(parseDesignChangeRequestPayload(withoutPage)).toBeNull();
    const { documentId: _omittedDoc, ...withoutDocument } = payload;
    expect(parseDesignChangeRequestPayload(withoutDocument)).toBeNull();
    expect(parseDesignChangeRequestPayload({ ...payload, documentId: "" })).toBeNull();
    expect(parseDesignChangeRequestPayload({ ...payload, pageUrl: "x".repeat(2049) })).toBeNull();
  });

  it("caps long page urls without letting distinct documents collide", () => {
    // The guest sends capPageUrl(location.href); the parser rejects anything longer than the
    // cap, so the capped form must always fit.
    const base = `data:text/html,${"a".repeat(3000)}`;
    expect(capPageUrl(base).length).toBeLessThanOrEqual(DESIGN_MODE_PAGE_URL_CAP);
    expect(capPageUrl("http://localhost:5173/")).toBe("http://localhost:5173/");
    // Two long data: documents sharing their first 2KB must still compare UNEQUAL — a plain
    // slice would collide them, and the draft store would replace one page's pill with the
    // other's, silently dropping its asks (PR #63 review).
    expect(capPageUrl(`${base}-variant-one`)).not.toBe(capPageUrl(`${base}-variant-two`));
    // Identical hrefs still cap identically, or the reload half of the key would never match.
    expect(capPageUrl(`${base}-same`)).toBe(capPageUrl(`${base}-same`));
  });
});
