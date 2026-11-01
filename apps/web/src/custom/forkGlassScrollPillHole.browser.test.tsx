/**
 * Fork glass scroll pill — see `.fork/customizations.yaml#fork-glass-scroll-pill`.
 * The pill can mount before the transcript's scroller, and the scroller can be
 * replaced under a mounted pill; the hole has to follow it either way.
 */
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";
import {
  FORK_PILL_HOLE_CUT_ATTRIBUTE,
  useForkGlassScrollPillHole,
} from "./forkGlassScrollPillHole";

const hasHoleWidth = (element: Element) =>
  element instanceof HTMLElement &&
  element.style.getPropertyValue("--fork-pill-hole-w") === "120px";

function Pill() {
  const laneRef = useForkGlassScrollPillHole(16);
  return (
    <div ref={laneRef} style={{ position: "absolute", bottom: 16, left: 0, right: 0 }}>
      <button data-scroll-to-end="true" style={{ width: 120, height: 24, borderRadius: 12 }}>
        Scroll to end
      </button>
    </div>
  );
}

function Timeline(props: { readonly scroller: string | null }) {
  return (
    <div style={{ position: "relative", width: 400, height: 400 }}>
      {props.scroller === null ? (
        <div>Loading</div>
      ) : (
        <div key={props.scroller} data-testid={props.scroller} className="fork-timeline-cutoff">
          <div style={{ height: 400 }} />
        </div>
      )}
      <Pill />
    </div>
  );
}

describe("useForkGlassScrollPillHole", () => {
  it("cuts the hole in a scroller that mounts after the pill", async () => {
    await using screen = await render(<Timeline scroller={null} />);
    const pill = screen.getByRole("button", { name: "Scroll to end" });
    await expect.element(pill).not.toHaveAttribute(FORK_PILL_HOLE_CUT_ATTRIBUTE);

    await screen.rerender(<Timeline scroller="first" />);
    await vi.waitFor(() => expect(screen.getByTestId("first").element()).toSatisfy(hasHoleWidth));
    await expect.element(pill).toHaveAttribute(FORK_PILL_HOLE_CUT_ATTRIBUTE);
  });

  it("follows a scroller replaced under the mounted pill", async () => {
    await using screen = await render(<Timeline scroller="first" />);
    await vi.waitFor(() => expect(screen.getByTestId("first").element()).toSatisfy(hasHoleWidth));

    await screen.rerender(<Timeline scroller="second" />);
    await vi.waitFor(() => expect(screen.getByTestId("second").element()).toSatisfy(hasHoleWidth));
    await expect
      .element(screen.getByRole("button", { name: "Scroll to end" }))
      .toHaveAttribute(FORK_PILL_HOLE_CUT_ATTRIBUTE);
  });
});
