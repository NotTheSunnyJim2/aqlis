import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "../src/App.js";

describe("App", () => {
  it("renders without crashing and shows the app name", () => {
    render(<App />);
    expect(screen.getByText("Aqlis")).toBeInTheDocument();
  });
});
