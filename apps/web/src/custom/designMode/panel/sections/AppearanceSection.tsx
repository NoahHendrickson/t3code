import { useState } from "react";

import { CornerRadiusIcon } from "../CornerRadiusIcon";
import { PanelSection, PanelToggle, ScrubField } from "../DesignPanelFields";
import { OpacityIcon, PerCornerIcon, RadiusIcon } from "../PanelIcons";
import type { SectionProps } from "./section";

/** The Figma "Appearance" group: opacity, uniform radius, and an expandable per-corner
 * grid behind the corners toggle (accent-lit while open). Corner state resets with the
 * keyed fields container, like every other field-local state. */
export function AppearanceSection({ element, apply, field }: SectionProps) {
  const [corners, setCorners] = useState(false);
  const { styles } = element;
  const cornerKeys = [
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-right-radius",
    "border-bottom-left-radius",
  ] as const;
  return (
    <PanelSection title="Appearance" className="grid-cols-[1fr_1fr_auto]">
      <ScrubField
        label="Opacity"
        icon={<OpacityIcon />}
        title="Opacity"
        value={styles.opacity}
        unit="none"
        min={0}
        max={1}
        step={0.01}
        precision={2}
        {...field("opacity")}
        onEdit={(v) => apply("opacity", v)}
      />
      <ScrubField
        label="Radius"
        icon={<RadiusIcon />}
        title="Corner radius (all corners)"
        value={styles["border-radius"]}
        min={0}
        // The uniform field writes the shorthand but a per-corner edit writes longhands, so
        // it counts as changed (and reverts) when either shape has a draft.
        {...field(cornerKeys, ["border-radius", ...cornerKeys])}
        onEdit={(v) => apply("border-radius", v)}
      />
      <PanelToggle
        pressed={corners}
        title={corners ? "Uniform radius" : "Per-corner radius"}
        onClick={() => setCorners((open) => !open)}
      >
        <PerCornerIcon />
      </PanelToggle>
      {corners ? (
        <>
          <ScrubField
            label="TL"
            icon={<CornerRadiusIcon corner="tl" />}
            title="Top-left radius"
            value={styles["border-top-left-radius"]}
            min={0}
            {...field("border-top-left-radius")}
            onEdit={(v) => apply("border-top-left-radius", v)}
          />
          <ScrubField
            label="TR"
            icon={<CornerRadiusIcon corner="tr" />}
            title="Top-right radius"
            value={styles["border-top-right-radius"]}
            min={0}
            {...field("border-top-right-radius")}
            onEdit={(v) => apply("border-top-right-radius", v)}
          />
          <div />
          <ScrubField
            label="BL"
            icon={<CornerRadiusIcon corner="bl" />}
            title="Bottom-left radius"
            value={styles["border-bottom-left-radius"]}
            min={0}
            {...field("border-bottom-left-radius")}
            onEdit={(v) => apply("border-bottom-left-radius", v)}
          />
          <ScrubField
            label="BR"
            icon={<CornerRadiusIcon corner="br" />}
            title="Bottom-right radius"
            value={styles["border-bottom-right-radius"]}
            min={0}
            {...field("border-bottom-right-radius")}
            onEdit={(v) => apply("border-bottom-right-radius", v)}
          />
          <div />
        </>
      ) : null}
    </PanelSection>
  );
}
