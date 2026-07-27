import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import { SidebarV2ThreadCardMeta } from "./SidebarV2ThreadCardMeta";

const base = {
  projectTitle: "alpha-service",
  branch: "main",
  prSlot: null,
  insertions: null,
  deletions: null,
  modelLabel: "gpt-5.4",
  isRemote: false,
} as const;

/** Rows are the only fixed-height elements in this markup. */
const countRows = (markup: string) => markup.split("h-[15px]").length - 1;

describe("SidebarV2ThreadCardMeta", () => {
  it("draws one row, carrying the model, when there is no PR and no diff", () => {
    const markup = renderToStaticMarkup(<SidebarV2ThreadCardMeta {...base} />);

    expect(countRows(markup)).toBe(1);
    // The model and runtime move up rather than disappearing with the row they
    // used to sit on.
    expect(markup).toContain("gpt-5.4");
    expect(markup).toContain("main");
  });

  it("draws the second row for a PR", () => {
    const markup = renderToStaticMarkup(
      <SidebarV2ThreadCardMeta {...base} prSlot={<button type="button">#12</button>} />,
    );

    expect(countRows(markup)).toBe(2);
    expect(markup).toContain("#12");
    expect(markup).toContain("gpt-5.4");
  });

  it("draws the second row for a diff, zero counts included", () => {
    const markup = renderToStaticMarkup(
      <SidebarV2ThreadCardMeta {...base} insertions={0} deletions={0} />,
    );

    expect(countRows(markup)).toBe(2);
    expect(markup).toContain("+0");
  });

  it("omits the project when the caller has none to give", () => {
    // What a grouped card passes: the project header above it already names the
    // project, so the branch takes the line.
    const markup = renderToStaticMarkup(<SidebarV2ThreadCardMeta {...base} projectTitle={null} />);

    expect(markup).not.toContain("alpha-service");
    expect(markup).toContain("main");
    expect(countRows(markup)).toBe(1);
  });
});
