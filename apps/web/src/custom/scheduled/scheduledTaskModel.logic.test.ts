import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { scheduledTaskDraftSelection } from "./scheduledTaskModel.logic";

const codex = ProviderInstanceId.make("codex");
const claude = ProviderInstanceId.make("claudeAgent");
const draft: ModelSelection = { instanceId: codex, model: "gpt-5" };
const projectDefault: ModelSelection = { instanceId: claude, model: "opus" };

describe("scheduledTaskDraftSelection", () => {
  it("keeps the draft's pick while its provider is enabled for the project", () => {
    const entries = [
      { instanceId: codex, enabled: true },
      { instanceId: claude, enabled: true },
    ];
    expect(scheduledTaskDraftSelection(draft, entries, () => projectDefault)).toBe(draft);
  });

  it("falls back to the project default once the project turns that provider off", () => {
    const entries = [
      { instanceId: codex, enabled: false },
      { instanceId: claude, enabled: true },
    ];
    expect(scheduledTaskDraftSelection(draft, entries, () => projectDefault)).toBe(projectDefault);
  });

  it("falls back when the draft's provider is gone or there is no pick", () => {
    const entries = [{ instanceId: claude, enabled: true }];
    expect(scheduledTaskDraftSelection(draft, entries, () => projectDefault)).toBe(projectDefault);
    expect(scheduledTaskDraftSelection(null, entries, () => projectDefault)).toBe(projectDefault);
  });
});
