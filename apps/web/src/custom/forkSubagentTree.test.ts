import { describe, expect, it } from "vite-plus/test";

import {
  formatForkSubagentModel,
  resolveForkSubagentTree,
  type ForkSubagentItem,
} from "./forkSubagentTree";

const item = (overrides: Partial<Record<keyof ForkSubagentItem, unknown>> = {}): ForkSubagentItem =>
  ({
    id: "item-1",
    type: "subagent",
    threadId: "thread-1",
    subagentId: "node-1",
    status: "running",
    origin: "app_owned",
    driver: "claude",
    providerInstanceId: "claude",
    childThreadId: null,
    prompt: "",
    result: null,
    startedAt: null,
    completedAt: null,
    title: "Subagent: /root/octopus_research",
    ...overrides,
  }) as unknown as ForkSubagentItem;

describe("resolveForkSubagentTree", () => {
  it("leads with the kicked-off wording while a member works, and ran once settled", () => {
    const live = resolveForkSubagentTree(
      [item(), item({ id: "item-2", subagentId: "node-2", status: "completed" })],
      null,
    );
    expect(live.lead).toBe("Kicked off 2 subagents");
    expect(live.summary).toBe("1 working · 1 done");
    expect(live.active).toBe(true);
    const settled = resolveForkSubagentTree([item({ status: "completed" })], null);
    expect(settled.lead).toBe("Ran 1 subagent");
    expect(settled.active).toBe(false);
  });

  it("prefers the live roster over the item for status, activity, model, timing and thread", () => {
    const tree = resolveForkSubagentTree(
      [item({ progress: "Reading files" })],
      [
        {
          id: "node-1",
          status: "completed",
          title: "Octopus research",
          model: "claude-opus-5-5",
          progress: "Reading files",
          result: "Found [three leads](https://x) in `src`",
          childThreadId: "thread-child",
          startedAt: null,
          completedAt: null,
        } as never,
      ],
    );
    const row = tree.rows[0]!;
    expect(row.status).toBe("completed");
    expect(row.mark).toBe("done");
    expect(row.detail).toBe("Found three leads in src");
    expect(row.model).toBe("claude-opus-5-5");
    expect(row.childThreadId).toBe("thread-child");
  });

  it("shows live progress while working and the status word when nothing says more", () => {
    expect(
      resolveForkSubagentTree([item({ progress: "Running tests" })], null).rows[0]!.detail,
    ).toBe("Running tests");
    expect(resolveForkSubagentTree([item()], null).rows[0]!.detail).toBe("Working");
    expect(
      resolveForkSubagentTree(
        [item({ status: "failed", result: "Child task ended with status failed" })],
        null,
      ).rows[0]!.detail,
    ).toBe("Failed");
    expect(resolveForkSubagentTree([item({ status: "interrupted" })], null).rows[0]!.mark).toBe(
      "stopped",
    );
  });

  it("title-cases Codex task paths through the shared display title", () => {
    expect(resolveForkSubagentTree([item()], null).rows[0]!.title).toBe("Octopus Research");
  });
});

describe("formatForkSubagentModel", () => {
  it("spells slugs the way the tree does", () => {
    expect(formatForkSubagentModel("claude-opus-5-5")).toBe("Opus 5.5");
    expect(formatForkSubagentModel("claude-sonnet-5")).toBe("Sonnet 5");
    expect(formatForkSubagentModel("gpt-6-astra")).toBe("GPT 6 Astra");
    expect(formatForkSubagentModel("default")).toBe("Default");
    expect(formatForkSubagentModel(null)).toBeNull();
    expect(formatForkSubagentModel("  ")).toBeNull();
  });
});
