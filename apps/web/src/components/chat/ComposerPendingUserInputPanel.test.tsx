import { ApprovalRequestId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import type { PendingUserInput } from "../../session-logic";

const prompt: PendingUserInput = {
  requestId: ApprovalRequestId.make("request-1"),
  createdAt: "2026-08-15T00:00:00.000Z",
  questions: [
    {
      id: "question-1",
      header: "Approach",
      question: "Which approach should the migration take?",
      options: [
        { label: "Incremental", description: "Move one module at a time" },
        { label: "Big bang", description: "Move everything in one release" },
      ],
      multiSelect: false,
    },
  ],
};

function renderPanel() {
  return renderToStaticMarkup(
    <ComposerPendingUserInputPanel
      pendingUserInputs={[prompt]}
      respondingRequestIds={[]}
      answers={{}}
      questionIndex={0}
      onToggleOption={() => {}}
      onAdvance={() => {}}
    />,
  );
}

describe("ComposerPendingUserInputPanel", () => {
  /* fork:begin fork-pending-user-input — see .fork/customizations.yaml#fork-pending-user-input
     These render through the Vite alias into the fork's shadowed panel, which
     draws the Questions card instead of upstream's disclosure header (#6773
     declined at the shadow — the manifest intent records the decision). The
     outcome that must hold is the same: the active question and its options
     are visible without any interaction. */
  it("renders the fork Questions card in place of upstream's disclosure", () => {
    const markup = renderPanel();

    expect(markup).toContain('data-fork-pending-user-input="true"');
    expect(markup).toContain("Questions");
    expect(markup).not.toContain("data-pending-user-input-toggle");
  });

  it("shows the question and its options without any interaction", () => {
    const markup = renderPanel();

    expect(markup).toContain("Which approach should the migration take?");
    expect(markup).toContain("Incremental");
    expect(markup).toContain("Big bang");
  });
  /* fork:end fork-pending-user-input */
});
