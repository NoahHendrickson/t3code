import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import { SidebarV2ThreadCardMeta } from "./SidebarV2ThreadCardMeta";

const base = {
  projectTitle: "alpha-service",
  projectIconSlot: null,
  branch: "main",
  terminalSlot: null,
  modelLabel: "gpt-5.4",
  isRemote: false,
} as const;

/** Counted by the row's own testid rather than by class-string sniffing: a
    substring count over Tailwind spellings silently zeroed when `cn`
    reordered a class run, and the test kept passing with the wrong number. */
const countRows = (markup: string) => markup.split('data-testid="sidebar-v2-card-line"').length - 1;

describe("SidebarV2ThreadCardMeta", () => {
  it("draws exactly one row, whatever the card carries", () => {
    // The component set fixes the card at 52px, so this line never doubles and
    // the card never reflows as per-row queries land. The PR badge lives on the
    // title line above; the diff counts left the design with the row that
    // carried them.
    const markup = renderToStaticMarkup(<SidebarV2ThreadCardMeta {...base} />);

    expect(countRows(markup)).toBe(1);
    expect(markup).toContain("gpt-5.4");
    expect(markup).toContain("main");
  });

  it("omits the project when the caller has none to give", () => {
    const markup = renderToStaticMarkup(<SidebarV2ThreadCardMeta {...base} projectTitle={null} />);

    expect(markup).not.toContain("alpha-service");
    expect(markup).toContain("main");
    expect(countRows(markup)).toBe(1);
  });

  it("leads the project name with the design's folder mark when no favicon is given", () => {
    // Ungrouped cards name their project on this line, and the mark is what
    // separates that name from the branch beside it at a glance.
    const markup = renderToStaticMarkup(<SidebarV2ThreadCardMeta {...base} />);

    expect(markup).toContain("alpha-service");
    expect(markup).toContain("lucide-folder");
  });

  it("leads the project name with its favicon when the caller has one", () => {
    // The favicon replaces the folder mark rather than joining it: one glyph
    // names the project, and the row's other marks (slim rows, project menu)
    // already use the favicon for that job.
    const markup = renderToStaticMarkup(
      <SidebarV2ThreadCardMeta
        {...base}
        projectIconSlot={<img data-testid="favicon" alt="" src="x" />}
      />,
    );

    expect(markup).toContain('data-testid="favicon"');
    expect(markup).not.toContain("lucide-folder");
  });

  it("keeps a grouped card's project name for assistive tech only", () => {
    // What a card under a project header passes. The header names the project
    // on screen; a screen reader has no "one row up", so the name stays in the
    // markup, out of the layout — and the folder mark goes with the layout.
    const markup = renderToStaticMarkup(
      <SidebarV2ThreadCardMeta
        {...base}
        projectTitleHidden
        projectIconSlot={<img data-testid="favicon" alt="" src="x" />}
      />,
    );

    expect(markup).toContain("alpha-service");
    expect(markup).toContain("sr-only");
    expect(markup).not.toContain("lucide-folder");
    expect(markup).not.toContain('data-testid="favicon"');
  });
});
