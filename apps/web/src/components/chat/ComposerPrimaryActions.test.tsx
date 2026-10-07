import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const stageArtworkState = vi.hoisted(() => ({
  mode: "none" as "artwork" | "none",
  variant: null as "nightly" | "dev" | null,
}));

vi.mock("~/hooks/useSettings", () => ({
  useEnvironmentIdentificationMode: () => stageArtworkState.mode,
}));
vi.mock("../SidebarStageBackdrop", () => ({
  StageBackdropButtonArt: ({ variant }: { variant: string }) => `stage-${variant}`,
  useSidebarStageBackdropVariant: (enabled = true) => (enabled ? stageArtworkState.variant : null),
}));

import { ComposerPrimaryActions } from "./ComposerPrimaryActions";

function renderPendingActions(isRunning: boolean) {
  return renderToStaticMarkup(
    createElement(ComposerPrimaryActions, {
      compact: true,
      canOperateThread: true,
      pendingAction: {
        questionIndex: 0,
        isLastQuestion: true,
        canAdvance: true,
        isResponding: false,
        isComplete: true,
      },
      isRunning,
      canInterrupt: isRunning,
      showPlanFollowUpPrompt: false,
      promptHasText: false,
      isSendBusy: false,
      sendDisabledReason: null,
      isConnecting: false,
      isEnvironmentUnavailable: false,
      isPreparingWorktree: false,
      hasSendableContent: false,
      onPreviousPendingQuestion: () => {},
      onInterrupt: () => {},
      onImplementPlanInNewThread: () => {},
    }),
  );
}

function renderSendButton(sendDisabledReason: string | null = null) {
  return renderToStaticMarkup(
    createElement(ComposerPrimaryActions, {
      compact: true,
      canOperateThread: true,
      pendingAction: null,
      isRunning: false,
      canInterrupt: false,
      showPlanFollowUpPrompt: false,
      promptHasText: true,
      isSendBusy: false,
      sendDisabledReason,
      isConnecting: false,
      isEnvironmentUnavailable: false,
      isPreparingWorktree: false,
      hasSendableContent: true,
      onPreviousPendingQuestion: () => {},
      onInterrupt: () => {},
      onImplementPlanInNewThread: () => {},
    }),
  );
}

afterEach(() => {
  stageArtworkState.mode = "none";
  stageArtworkState.variant = null;
});

describe("ComposerPrimaryActions", () => {
  it("disables and labels the send button while feedback is uploading", () => {
    const markup = renderSendButton("Sending feedback");

    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-label="Sending feedback"');
  });

  it("offers Stop generation while a running turn is waiting for user input", () => {
    expect(renderPendingActions(true)).toContain('aria-label="Stop generation"');
  });

  it("does not offer Stop generation for a pending request without a running turn", () => {
    expect(renderPendingActions(false)).not.toContain('aria-label="Stop generation"');
  });

  it("renders stage artwork inside the send button when artwork identification is active", () => {
    stageArtworkState.mode = "artwork";
    stageArtworkState.variant = "nightly";

    const markup = renderSendButton();

    expect(markup).toContain("stage-nightly");
  });

  it("hides stage artwork when artwork identification is inactive", () => {
    stageArtworkState.variant = "nightly";

    const markup = renderSendButton();

    expect(markup).not.toContain("stage-nightly");
  });

  /* fork:begin fork-local-dictation — see .fork/customizations.yaml#fork-local-dictation */
  it("keeps stop at the right edge with dictation beside it while running", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerPrimaryActions, {
        compact: true,
        canOperateThread: true,
        pendingAction: null,
        isRunning: true,
        canInterrupt: true,
        showPlanFollowUpPrompt: false,
        promptHasText: false,
        isSendBusy: false,
        sendDisabledReason: null,
        isConnecting: false,
        isEnvironmentUnavailable: false,
        isPreparingWorktree: false,
        hasSendableContent: false,
        forkDictation: {
          dictation: {
            isAvailable: true,
            state: { phase: "idle" },
            downloadPercent: null,
            error: null,
            errorAction: null,
            blocksSubmission: false,
            freezesEditor: false,
            subscribeLevel: () => () => {},
            start: () => {},
            stop: () => {},
            cancel: () => {},
            settleWithoutControls: () => {},
          } as never,
          disabled: false,
        },
        onPreviousPendingQuestion: () => {},
        onInterrupt: () => {},
        onImplementPlanInNewThread: () => {},
      }),
    );

    const dictate = markup.indexOf('data-fork-dictation-action="dictate"');
    const stop = markup.indexOf('aria-label="Stop generation"');
    expect(dictate).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(dictate);
    expect(markup).not.toContain('aria-label="Submit message"');
  });
  /* fork:end fork-local-dictation */
});
