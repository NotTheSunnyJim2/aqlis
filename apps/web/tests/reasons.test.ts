import { describe, expect, it } from "vitest";
import { describeReason } from "../src/lib/reasons.js";

describe("describeReason", () => {
  it("describes a known excluded activity", () => {
    expect(describeReason("EXCLUDED_ACTIVITY:GAMBLING")).toBe(
      "Excluded business activity: Gambling",
    );
  });

  it("describes a ratio threshold breach", () => {
    expect(describeReason("RATIO_EXCEEDED:DEBT")).toBe("Debt ratio exceeds its threshold");
  });

  it("describes an unknown/missing-data reason", () => {
    expect(describeReason("UNKNOWN:CASH_RATIO")).toBe(
      "Cash & interest-bearing securities ratio is unknown — missing data",
    );
  });

  it("describes the business-activity-classification unknown case", () => {
    expect(describeReason("UNKNOWN:BUSINESS_ACTIVITY_CLASSIFICATION")).toBe(
      "Business activity classification is unknown — missing data",
    );
  });

  it("falls back to the raw code for an unrecognized shape, never hiding it", () => {
    expect(describeReason("SOME_FUTURE_CODE")).toBe("SOME_FUTURE_CODE");
  });

  it("falls back to the raw suffix for an unrecognized category within a known prefix", () => {
    expect(describeReason("EXCLUDED_ACTIVITY:SOMETHING_NEW")).toBe(
      "Excluded business activity: SOMETHING_NEW",
    );
  });
});
