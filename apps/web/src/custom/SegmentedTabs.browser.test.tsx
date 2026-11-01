import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";

import { act, render } from "../../test/render";
import { SegmentedTab, SegmentedTabs } from "./SegmentedTabs";

function ProjectTabs() {
  const [value, setValue] = useState("a");
  return (
    <SegmentedTabs
      value={[value]}
      onValueChange={(next) => {
        if (typeof next[0] === "string") setValue(next[0]);
      }}
    >
      {["a", "b", "c", "d"].map((key) => (
        <SegmentedTab key={key} value={key} aria-label={key} className="w-7 px-0">
          {key}
        </SegmentedTab>
      ))}
    </SegmentedTabs>
  );
}

describe("SegmentedTabs", () => {
  it("retires a glide still moving when the selection moves again", async () => {
    await using screen = await render(<ProjectTabs />);
    const tab = (name: string) => {
      const element = screen.getByRole("button", { name }).element();
      if (!(element instanceof HTMLElement)) throw new Error(`no tab ${name}`);
      return element;
    };
    const d = tab("d");
    const c = tab("c");

    await act(() => d.click());
    await vi.waitFor(() => expect(d.getAnimations()).not.toHaveLength(0));
    // Partway from a to d, where d's box covers c's label.
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = 120;
    }
    await act(() => c.click());
    await vi.waitFor(() => expect(c.getAnimations()).not.toHaveLength(0));

    expect(d.getAnimations()).toHaveLength(0);
    expect(d.style.zIndex).toBe("");
    const label = c.firstElementChild!.getBoundingClientRect();
    const hit = document.elementFromPoint(label.x + label.width / 2, label.y + label.height / 2);
    expect(hit?.closest("button")).toBe(c);
  });
});
