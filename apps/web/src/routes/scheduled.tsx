// Fork-only route — see `.fork/customizations.yaml#fork-scheduled-page`.
// Upstream has never seen this file; the route tree regenerates around it.
import { createFileRoute } from "@tanstack/react-router";

import { ScheduledPage } from "~/custom/scheduled/ScheduledPage";
import { validateScheduledPageSearch } from "~/custom/scheduled/scheduledPage.logic";

export const Route = createFileRoute("/scheduled")({
  validateSearch: validateScheduledPageSearch,
  component: ScheduledPage,
});
