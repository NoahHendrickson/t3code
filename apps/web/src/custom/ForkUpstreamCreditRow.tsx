import { Button } from "~/components/ui/button";
import { SettingsRow } from "~/components/settings/settingsLayout";

import { FORK_APP_BASE_NAME } from "./forkBranding";

const UPSTREAM_REPOSITORY_URL = "https://github.com/pingdotgg/t3code";

/** Settings › About credit — see `.fork/customizations.yaml#fork-brand-name`. */
export function ForkUpstreamCreditRow() {
  return (
    <SettingsRow
      title="Fork of T3 Code"
      description={`${FORK_APP_BASE_NAME} is built on the open-source upstream project.`}
      control={
        <Button
          render={<a href={UPSTREAM_REPOSITORY_URL} target="_blank" rel="noreferrer noopener" />}
          size="sm"
          variant="outline"
        >
          View upstream
        </Button>
      }
    />
  );
}
