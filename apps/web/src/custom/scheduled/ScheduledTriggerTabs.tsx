import type { ToggleGroup } from "@base-ui/react/toggle-group";

import { SegmentedTab, SegmentedTabs } from "../SegmentedTabs";

export function ScheduledTriggerTabs(props: Pick<ToggleGroup.Props, "value" | "onValueChange">) {
  return (
    <div className="max-w-full overflow-x-auto">
      <SegmentedTabs {...props} aria-label="Trigger type">
        {[
          ["fixed", "At a time"],
          ["interval", "Every interval"],
          ["github_pr", "GitHub PR opened"],
          ["webhook", "Custom webhook"],
        ].map(([value, label]) => (
          <SegmentedTab key={value} value={value}>
            {label}
          </SegmentedTab>
        ))}
      </SegmentedTabs>
    </div>
  );
}
