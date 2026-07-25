// @effect-diagnostics nodeBuiltinImport:off
/**
 * Fork guard — see `.fork/customizations.yaml#release-upstream-only`.
 *
 * The Release workflow publishes the CLI to npm and cuts GitHub Releases on a
 * 3-hourly cron. It must never fire on this fork. Today it is gated at both
 * entry points (`check_changes`, `preflight`), and every other job inherits the
 * gate by requiring preflight to have succeeded.
 *
 * That inheritance is the fragile part: an upstream sync that adds a job which
 * does *not* depend on preflight would quietly reopen the path to publishing.
 * So this asserts the property for every job in the file, not just the two
 * that carry the literal condition.
 *
 * Note the gate deliberately does not rely on runner labels. The scheduled runs
 * published nothing before this existed only because they hung forever on
 * Blacksmith labels the fork cannot schedule — an accident of `ci-runners`, not
 * a safeguard.
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
const readReleaseJobs = (): ReadonlyArray<{ id: string; body: string }> => {
  const yaml = NodeFS.readFileSync(
    NodePath.join(repoRoot, ".github/workflows/release.yml"),
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

describe("fork guard: release-upstream-only", () => {
  it("gates both release entry points on the upstream repository", () => {
    const jobs = readReleaseJobs();
    const gated = jobs.filter((job) => job.body.includes(UPSTREAM_GATE)).map((job) => job.id);
    expect(gated).toEqual(["check_changes", "preflight"]);
  });

  it("leaves no job able to run without the gate", () => {
    const jobs = readReleaseJobs();
    // A job is safe if it carries the gate itself, or if its own `if:` refuses
    // to run unless preflight succeeded — preflight being gated, that cascades.
    const ungated = jobs
      .filter(
        (job) =>
          !job.body.includes(UPSTREAM_GATE) &&
          !job.body.includes("needs.preflight.result == 'success'"),
      )
      .map((job) => job.id);
    expect(ungated).toEqual([]);
  });

  it("reads every job in the workflow", () => {
    // Guards the parser itself: if the indentation convention changes and this
    // finds nothing, the two assertions above would pass vacuously.
    expect(readReleaseJobs().length).toBeGreaterThanOrEqual(9);
  });
});
