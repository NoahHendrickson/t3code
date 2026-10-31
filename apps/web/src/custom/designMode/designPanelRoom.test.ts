import { afterEach, describe, expect, it } from "vite-plus/test";

import { designPaneWidth, useDesignPanelRoomStore } from "./designPanelRoom";

const room = (threadKey: string) => {
  const tabs = useDesignPanelRoomStore.getState().byThreadKey[threadKey];
  return tabs ? Math.max(...Object.values(tabs)) : undefined;
};

afterEach(() => useDesignPanelRoomStore.setState({ byThreadKey: {} }));

describe("design panel room", () => {
  it("takes the largest need across a thread's preview tabs", () => {
    const { setRoom } = useDesignPanelRoomStore.getState();
    setRoom("thread", "tab-a", designPaneWidth(false));
    setRoom("thread", "tab-b", designPaneWidth(true));
    expect(room("thread")).toBe(designPaneWidth(true));
  });

  it("keeps another tab's need when one tab clears its own", () => {
    const { setRoom } = useDesignPanelRoomStore.getState();
    setRoom("thread", "tab-a", designPaneWidth(true));
    setRoom("thread", "tab-b", designPaneWidth(false));
    setRoom("thread", "tab-b", null);
    expect(room("thread")).toBe(designPaneWidth(true));
    setRoom("thread", "tab-a", null);
    expect(useDesignPanelRoomStore.getState().byThreadKey).toEqual({});
  });

  it("scopes needs to their own thread", () => {
    useDesignPanelRoomStore.getState().setRoom("thread", "tab-a", designPaneWidth(true));
    expect(room("other-thread")).toBeUndefined();
  });
});
