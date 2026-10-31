/**
 * Fork guard — see `.fork/README.md` §4b and
 * `.fork/customizations.yaml#sidebar-v2-card-rows`.
 *
 * Every working mark rewinds by a per-thread offset so a sidebar full of
 * working threads does not fall or twist in lockstep. This pins the hash that
 * spreads them.
 */

import { describe, expect, it } from "vite-plus/test";
import { rainOffsetSeconds } from "~/custom/SidebarV2StatusIndicator";

describe("fork guard: sidebar-v2 rain phase offsets", () => {
  it("is deterministic per thread key", () => {
    expect(rainOffsetSeconds("thread-abc")).toBe(rainOffsetSeconds("thread-abc"));
  });

  it("stays inside one loop's worth of rewind", () => {
    for (const seed of ["", "a", "thread-1", "🙂", "x".repeat(200)]) {
      const offset = rainOffsetSeconds(seed);
      expect(Number.isFinite(offset)).toBe(true);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(32);
    }
  });

  it("avalanches sequential ids apart", () => {
    // The reason the murmur3 finalizer is there: plain FNV leaves keys that
    // differ only in the last character within a second of each other, and the
    // rows then read as one synchronised block. Sequential ids are exactly the
    // shape real thread keys take.
    const offsets = Array.from({ length: 12 }, (_, index) => rainOffsetSeconds(`thread-${index}`));
    for (let i = 0; i < offsets.length; i++) {
      for (let j = i + 1; j < offsets.length; j++) {
        expect(Math.abs((offsets[i] ?? 0) - (offsets[j] ?? 0))).toBeGreaterThan(0.25);
      }
    }
  });
});
