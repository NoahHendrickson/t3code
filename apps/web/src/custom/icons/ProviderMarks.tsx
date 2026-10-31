/* Provider marks for space tabs, see `.fork/customizations.yaml#fork-spaces`. Claude's
   is the CLI's start-up mascot (▐▛███▜▌ / ▝▜█████▛▘ / ▘▘ ▝▝) at 1 × 2 pixels, since a
   terminal cell is twice as tall as wide. Codex's is the Codex app icon's cloud and
   prompt, redrawn as a vector to stay crisp at 14px. */
import { ProviderDriverKind } from "@t3tools/contracts";
import { type SVGProps, useId } from "react";

import { ProviderInstanceIcon, providerTextColor } from "~/components/chat/ProviderInstanceIcon";
import { cn } from "~/lib/utils";

/** Filled runs per pixel row, [first, last] inclusive, on an 18-wide grid. */
const CLAUDE_MASCOT_ROWS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[3, 14]],
  [
    [3, 4],
    [6, 11],
    [13, 14],
  ],
  [[1, 16]],
  [[3, 14]],
  [
    [4, 4],
    [6, 6],
    [11, 11],
    [13, 13],
  ],
];

const CLAUDE_MASCOT_PATH = CLAUDE_MASCOT_ROWS.flatMap((runs, row) =>
  runs.map(([first, last]) => `M${first} ${row * 2}h${last - first + 1}v2h${first - last - 1}z`),
).join("");

function ClaudeMascotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="1 0 16 10" fill="#d97757" shapeRendering="crispEdges" {...props}>
      <path d={CLAUDE_MASCOT_PATH} />
    </svg>
  );
}

/** Eight lobes round a core, turned a little off the axes as the icon's are. */
const CODEX_CLOUD_LOBES = Array.from({ length: 8 }, (_, index) => {
  const angle = ((index * 45 - 12) * Math.PI) / 180;
  return { cx: 12 + 6.4 * Math.cos(angle), cy: 12 + 6.4 * Math.sin(angle) };
});

function CodexIcon(props: SVGProps<SVGSVGElement>) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <defs>
        <linearGradient id={gradientId} x1="0.45" y1="0" x2="0.55" y2="1">
          <stop offset="0" stopColor="#bba8f6" />
          <stop offset="0.45" stopColor="#6f8ff2" />
          <stop offset="1" stopColor="#2f2cf2" />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradientId})`}>
        <circle cx="12" cy="12" r="7.6" />
        {CODEX_CLOUD_LOBES.map((lobe) => (
          <circle key={`${lobe.cx}:${lobe.cy}`} cx={lobe.cx} cy={lobe.cy} r="3.6" />
        ))}
      </g>
      <path
        d="M8.6 8.6 10.4 11.9 8.6 15.2M13.2 15.2h3.4"
        fill="none"
        stroke="#e8edff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A thread's provider at the 14px of the cards' marks: Claude's mascot, the
    Codex cloud, or the provider's own icon. */
export function ProviderMark(props: {
  /** The driver, or a default instance's id, which is its driver's. */
  readonly driverKind: string;
  readonly displayName: string;
}) {
  if (props.driverKind === "claudeAgent") {
    return <ClaudeMascotIcon aria-label={props.displayName} className="w-3.5 shrink-0" />;
  }
  if (props.driverKind === "codex") {
    return <CodexIcon aria-label={props.displayName} className="size-3.5 shrink-0" />;
  }
  const driverKind = ProviderDriverKind.make(props.driverKind);
  const color = providerTextColor(driverKind);
  return (
    <ProviderInstanceIcon
      driverKind={driverKind}
      displayName={props.displayName}
      size="compact"
      className={cn("size-3.5", color.className)}
    />
  );
}
