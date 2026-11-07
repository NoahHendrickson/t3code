import type { ToggleGroup } from "@base-ui/react/toggle-group";

import { SegmentedTab, SegmentedTabs } from "../SegmentedTabs";

export function ScheduledTriggerTabs(
  props: Pick<ToggleGroup.Props, "value" | "onValueChange"> & { readonly offersOnce: boolean },
) {
  const { offersOnce, ...tabs } = props;
  return (
    <div className="max-w-full overflow-x-auto">
      <SegmentedTabs {...tabs} aria-label="Trigger type">
        {[
          ["fixed", "At a time"],
          ...(offersOnce ? [["once", "Once"]] : []),
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
