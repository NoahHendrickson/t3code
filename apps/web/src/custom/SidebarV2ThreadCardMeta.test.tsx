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

/** Rows are the only fixed-height elements in this markup: the repo line is
    body/sm at h-4, the meta line caption at h-[15px] — Figma 113:3718. Both
    spellings are anchored to their row's full class run so an icon-sized
    `size-4` can never inflate the count. */
const countRows = (markup: string) =>
  markup.split("h-[15px]").length + markup.split("flex h-4 min-w-0").length - 2;

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

  it("holds the second row open while the PR is still unknown", () => {
    // Collapsing on "no PR yet" and growing when the query lands would reflow
    // the list under the pointer, once per PR-carrying card.
    const markup = renderToStaticMarkup(<SidebarV2ThreadCardMeta {...base} prUnknown />);

    expect(countRows(markup)).toBe(2);
  });

  it("omits the project when the caller has none to give", () => {
    const markup = renderToStaticMarkup(<SidebarV2ThreadCardMeta {...base} projectTitle={null} />);

    expect(markup).not.toContain("alpha-service");
    expect(markup).toContain("main");
    expect(countRows(markup)).toBe(1);
  });

  it("keeps a grouped card's project name for assistive tech only", () => {
    // What a card under a project header passes. The header names the project
    // on screen; a screen reader has no "two rows up", so the name stays in the
    // markup, out of the layout.
    const markup = renderToStaticMarkup(<SidebarV2ThreadCardMeta {...base} projectTitleHidden />);

    expect(markup).toContain("alpha-service");
    expect(markup).toContain("sr-only");
    expect(markup).not.toContain('class="max-w-[45%] shrink-0 truncate"');
  });
});
