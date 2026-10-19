// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  installTouchLongPressContextMenu,
  isTouchContextMenuMissing,
  LONG_PRESS_MS,
} from "./touchLongPressContextMenu";

const IPHONE = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
  platform: "iPhone",
  maxTouchPoints: 5,
};
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

describe("isTouchContextMenuMissing", () => {
  it("is true on iPhone and iPadOS, false on Android and desktop Macs", () => {
    expect(isTouchContextMenuMissing(IPHONE)).toBe(true);
    expect(
      isTouchContextMenuMissing({
        userAgent: "Macintosh",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(isTouchContextMenuMissing(ANDROID)).toBe(false);
    expect(
      isTouchContextMenuMissing({
        userAgent: "Macintosh",
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });
});

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

  it("installs nothing where the platform already fires contextmenu", () => {
    uninstall = installTouchLongPressContextMenu(document, ANDROID);
    pointer("pointerdown", row);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onContextMenu).not.toHaveBeenCalled();
  });
});
