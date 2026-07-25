/**
 * Fork guard — see `.fork/README.md` §4b and `.fork/customizations.yaml#fork-marker`.
 *
 * A rebase can succeed and still silently drop a customization: upstream
 * rewrites the surrounding code, git resolves "cleanly", and the fork hunk
 * evaporates with a green checkmark. These tests turn that into a red one.
 * Guards assert outcomes, not implementation details.
 */

import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  applyForkMarker,
  FORK_MARKER_ATTRIBUTE,
  FORK_MARKER_VALUE,
} from "../custom/forkMarker";

function readSibling(relativePath: string): string {
  return NodeFS.readFileSync(NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("fork guard: fork-marker", () => {
  it("stamps the marker attribute on the given root", () => {
    const seen: Record<string, string> = {};
    applyForkMarker({
      setAttribute: (name, value) => {
        seen[name] = value;
      },
    });
    expect(seen).toEqual({ [FORK_MARKER_ATTRIBUTE]: FORK_MARKER_VALUE });
  });

  it("stays wired into main.tsx across upstream rebases", () => {
    const main = readSibling("../main.tsx");
    expect(main).toContain('import "./theme.custom.css"');
    expect(main).toContain("applyForkMarker(document.documentElement)");
  });

  it("loads the fork theme layer after upstream's index.css so fork styling wins ties", () => {
    const main = readSibling("../main.tsx");
    const upstreamCss = main.indexOf('import "./index.css"');
    const forkCss = main.indexOf('import "./theme.custom.css"');
    expect(upstreamCss).toBeGreaterThanOrEqual(0);
    expect(forkCss).toBeGreaterThan(upstreamCss);
  });

  it("keeps every fork theme rule scoped under the marker attribute", () => {
    const theme = readSibling("../theme.custom.css");
    expect(theme).toContain(`[${FORK_MARKER_ATTRIBUTE}="${FORK_MARKER_VALUE}"]`);
  });
});
