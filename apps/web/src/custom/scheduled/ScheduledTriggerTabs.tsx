import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

/** Trigger choices styled after the fork's Figma Tabs List (521:5338). */
export function ScheduledTriggerTabs(props: Pick<ToggleGroup.Props, "value" | "onValueChange">) {
  return (
    <div className="max-w-full overflow-x-auto">
      <ToggleGroup
        {...props}
        aria-label="Trigger type"
        className="flex w-max items-center overflow-clip rounded-sm bg-muted p-0.5 dark:bg-white/6"
      >
        {[
          ["fixed", "At a time"],
          ["interval", "Every interval"],
          ["github_pr", "GitHub PR opened"],
          ["webhook", "Custom webhook"],
        ].map(([value, label]) => (
          <Toggle
            key={value}
            value={value}
            className="inline-flex h-6 shrink-0 cursor-pointer items-center justify-center rounded-[calc(var(--radius-sm)-2px)] px-2.5 text-xs leading-4 font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-pressed:bg-background data-pressed:text-foreground dark:data-pressed:bg-white/16 dark:data-pressed:text-white"
          >
            {label}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  );
}
