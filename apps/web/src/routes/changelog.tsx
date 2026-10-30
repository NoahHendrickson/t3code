// Fork-only route — see `.fork/customizations.yaml#fork-spaces`.
// Upstream has never seen this file; the route tree regenerates around it.
import { createFileRoute } from "@tanstack/react-router";

import { ChangelogPage } from "~/custom/spaces/ChangelogPage";

export const Route = createFileRoute("/changelog")({
  validateSearch: (raw: Record<string, unknown>): { readonly space?: string } =>
    typeof raw.space === "string" && raw.space.length > 0 ? { space: raw.space } : {},
  component: ChangelogPage,
});
