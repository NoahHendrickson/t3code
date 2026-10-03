import {
  OrchestrationProjectShell,
  OrchestrationShellSnapshot,
  OrchestrationThreadShell,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Arbitrary from "effect/unstable/arbitrary/Arbitrary";

import { encodeShellSnapshotForCache } from "./persistence.ts";

// Generated values can hold untrimmed strings, which a decoded value never
// has. One encode and decode gives a value a client can hold; values that
// fail are dropped. Size 30 makes the generator fill optional fields.
const sampleDecoded = <S extends Schema.Constraint>(schema: S) =>
  Effect.gen(function* () {
    const encode = Schema.encodeEffect(schema);
    const decode = Schema.decodeEffect(schema);
    const generated = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
      count: 1000,
      size: 30,
    });
    const decoded = yield* Effect.forEach(generated, (value) =>
      encode(value).pipe(Effect.flatMap(decode), Effect.option),
    );
    return Arr.getSomes(decoded);
  });
const encodeSnapshot = Schema.encodeEffect(OrchestrationShellSnapshot);

describe("encodeShellSnapshotForCache", () => {
  // fork:begin ci-runners — see .fork/customizations.yaml#ci-runners
  // Two 1,000-sample arbitraries at size 30, each encoded and decoded back,
  // run ~0.5 s on a laptop and past this package's default 5 s on
  // GitHub-hosted runners with the other packages' suites alongside (CI
  // timed out twice in a row on the same commit). Deterministic work, so a
  // per-test raise rather than a smaller sample.
  it.effect(
    "matches the Schema encoding of a generated snapshot",
    () =>
      Effect.gen(function* () {
        const threads = yield* sampleDecoded(OrchestrationThreadShell);
        const projects = yield* sampleDecoded(OrchestrationProjectShell);
        const snapshot: OrchestrationShellSnapshot = {
          snapshotSequence: 1,
          // The generator rarely makes monogram icons, and they are the one
          // project field whose encoding differs from the decoded value.
          projects: projects.map((project, index) =>
            index % 2 === 0
              ? { ...project, projectIcon: { kind: "monogram", text: "T3", color: "blue" } }
              : project,
          ),
          threads,
          updatedAt: "2026-09-25T00:00:00.000Z",
        };

        expect(threads.length).toBeGreaterThan(0);
        expect(projects.length).toBeGreaterThan(0);
        expect(yield* encodeShellSnapshotForCache(snapshot)).toEqual(
          yield* encodeSnapshot(snapshot),
        );
      }),
    60_000,
  );
  // fork:end ci-runners
});
