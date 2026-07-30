import { describe, expect, it } from "vitest";
import { describeDriftEvent } from "../src/lib/describe-drift-event.js";
import type { DriftEventMessage } from "../src/lib/realtime-events.js";

describe("describeDriftEvent", () => {
  it("describes a VERDICT_FLIPPED event using the new status", () => {
    const event: DriftEventMessage = {
      type: "drift",
      symbol: "T",
      alertType: "VERDICT_FLIPPED",
      ratio: null,
      previousValue: null,
      currentValue: null,
      threshold: null,
      status: "COMPLIANT",
    };
    expect(describeDriftEvent(event)).toBe("T is now Compliant");
  });

  it("describes a RATIO_THRESHOLD_CROSSED event with before/after and threshold — the real T story", () => {
    const event: DriftEventMessage = {
      type: "drift",
      symbol: "T",
      alertType: "RATIO_THRESHOLD_CROSSED",
      ratio: "DEBT",
      previousValue: 0.0293,
      currentValue: 0.9639,
      threshold: 0.33,
      status: "NON_COMPLIANT",
    };
    expect(describeDriftEvent(event)).toBe(
      "T: Debt ratio crossed its 33% threshold (2.9% → 96.4%)",
    );
  });
});
