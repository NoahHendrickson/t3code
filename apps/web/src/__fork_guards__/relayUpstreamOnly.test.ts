// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#relay-upstream-only`.
 *
 * deploy-relay.yml deploys the production relay with live credentials on
 * every push to main. On the fork, pushes to main are the hourly mirror
 * advancing over unreviewed upstream code — authenticated by a deploy key,
 * which (unlike GITHUB_TOKEN) does trigger push workflows. Every job in the
 * file must therefore be gated on the repository being upstream, and the
 * gate must stay independent of runner labels: Blacksmith not being
 * installed here is an accident, not a safeguard.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

const repoRoot = NodePath.resolve(
  NodeURL.fileURLToPath(new URL(".", import.meta.url)),
  "../../../..",
);

const UPSTREAM_GATE = "github.repository == 'pingdotgg/t3code'";

/** Split the `jobs:` mapping into one entry per job, keyed by job id. */
const readRelayJobs = (): ReadonlyArray<{ id: string; body: string }> => {
  const yaml = NodeFS.readFileSync(
    NodePath.join(repoRoot, ".github/workflows/deploy-relay.yml"),
    "utf8",
  );
  const jobsSection = yaml.slice(yaml.search(/^jobs:$/mu));
  const jobs: Array<{ id: string; body: string }> = [];
  // Job ids sit at exactly two spaces of indent; anything deeper is job body.
  const jobHeader = /^ {2}([A-Za-z_][\w-]*):$/gmu;
  const headers = [...jobsSection.matchAll(jobHeader)];
  for (const [index, header] of headers.entries()) {
    const id = header[1];
    if (id === undefined) continue;
    const start = header.index + header[0].length;
    const end = headers[index + 1]?.index ?? jobsSection.length;
    jobs.push({ id, body: jobsSection.slice(start, end) });
  }
  return jobs;
};

describe("fork guard: relay-upstream-only", () => {
  it("gates every relay deploy job on the upstream repository", () => {
    const jobs = readRelayJobs();
    const ungated = jobs.filter((job) => !job.body.includes(UPSTREAM_GATE)).map((job) => job.id);
    expect(ungated).toEqual([]);
  });

  it("reads every job in the workflow", () => {
    // Guards the parser itself: if the indentation convention changes and this
    // finds nothing, the assertion above would pass vacuously.
    expect(readRelayJobs().length).toBeGreaterThanOrEqual(1);
  });
});
