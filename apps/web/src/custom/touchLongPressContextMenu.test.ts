// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { installTouchLongPressContextMenu, LONG_PRESS_MS } from "./touchLongPressContextMenu";

const IPHONE = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
  platform: "iPhone",
  maxTouchPoints: 5,
};
const IPADOS = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
  platform: "MacIntel",
  maxTouchPoints: 5,
};
const DESKTOP_MAC = { ...IPADOS, maxTouchPoints: 0 };
const ANDROID = {
  userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile",
  platform: "Linux armv8l",
  maxTouchPoints: 5,
};

function pointer(type: string, target: Element, init: Partial<PointerEventInit> = {}) {
  // jsdom has no PointerEvent; a MouseEvent carrying the pointer fields is
  // what the listeners read.
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: init.clientX ?? 10,
    clientY: init.clientY ?? 10,
  });
  Object.assign(event, {
    pointerType: init.pointerType ?? "touch",
    isPrimary: true,
    pointerId: 1,
  });
  target.dispatchEvent(event);
}

describe("installTouchLongPressContextMenu", () => {
  let uninstall: () => void = () => {};
  let row: HTMLElement;
  let plain: HTMLElement;
  const onContextMenu = vi.fn((event: MouseEvent) => event.preventDefault());
  const onClick = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<li data-thread-item><div role="button"><span id="title">Title</span></div></li><p id="plain">text</p>';
    row = document.getElementById("title")!;
    plain = document.getElementById("plain")!;
    document.body.addEventListener("contextmenu", onContextMenu);
    document.body.addEventListener("click", onClick);
  });

  afterEach(() => {
    uninstall();
    document.body.removeEventListener("contextmenu", onContextMenu);
    document.body.removeEventListener("click", onClick);
    onContextMenu.mockClear();
    onClick.mockClear();
    vi.useRealTimers();
  });

  it("opens the menu at the finger after a still hold and swallows the release click", () => {
    uninstall = installTouchLongPressContextMenu(document, IPHONE);
    pointer("pointerdown", row, { clientX: 40, clientY: 60 });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu.mock.calls[0]![0]).toMatchObject({ clientX: 40, clientY: 60 });

    pointer("pointerup", row);
    row.click();
    expect(onClick).not.toHaveBeenCalled();

    // Only the one click: the next tap goes through.
    pointer("pointerdown", row);
    pointer("pointerup", row);
    row.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a tap, a scroll, a mouse, or a surface that is not opted in", () => {
    uninstall = installTouchLongPressContextMenu(document, IPHONE);

    pointer("pointerdown", row);
    pointer("pointerup", row);
    vi.advanceTimersByTime(LONG_PRESS_MS);

    pointer("pointerdown", row, { clientX: 10, clientY: 10 });
    pointer("pointermove", row, { clientX: 10, clientY: 40 });
    vi.advanceTimersByTime(LONG_PRESS_MS);

    pointer("pointerdown", row, { pointerType: "mouse" });
    vi.advanceTimersByTime(LONG_PRESS_MS);

    pointer("pointerdown", plain);
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it("runs on iPadOS, which reports a desktop Mac with touch points", () => {
    uninstall = installTouchLongPressContextMenu(document, IPADOS);
    pointer("pointerdown", row);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("installs nothing where the platform already fires contextmenu, or has no touch", () => {
    for (const nav of [ANDROID, DESKTOP_MAC]) {
      const remove = installTouchLongPressContextMenu(document, nav);
      pointer("pointerdown", row);
      vi.advanceTimersByTime(LONG_PRESS_MS);
      remove();
    }
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it("lets go of the click latch shortly after release when no click follows", () => {
    uninstall = installTouchLongPressContextMenu(document, IPHONE);
    pointer("pointerdown", row);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    pointer("pointerup", row);
    vi.advanceTimersByTime(1000);
    // A keyboard-initiated click has no pointerdown to reset the latch.
    row.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
