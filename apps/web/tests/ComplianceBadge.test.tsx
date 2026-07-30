import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComplianceBadge } from "../src/components/ComplianceBadge.js";

describe("ComplianceBadge", () => {
  it("renders 'Compliant' for COMPLIANT", () => {
    render(<ComplianceBadge status="COMPLIANT" />);
    expect(screen.getByText("Compliant")).toBeInTheDocument();
  });

  it("renders 'Non-compliant' for NON_COMPLIANT", () => {
    render(<ComplianceBadge status="NON_COMPLIANT" />);
    expect(screen.getByText("Non-compliant")).toBeInTheDocument();
  });

  it("renders 'Unknown' for a computed UNKNOWN verdict", () => {
    render(<ComplianceBadge status="UNKNOWN" />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("renders 'Pending' (not 'Unknown') when no verdict has EVER been computed", () => {
    // The distinction that matters: null means "never checked", a
    // fundamentally different fact from a computed UNKNOWN verdict.
    render(<ComplianceBadge status={null} />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
  });
});
