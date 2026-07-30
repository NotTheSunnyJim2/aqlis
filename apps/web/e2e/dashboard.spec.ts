import { test, expect, type Page } from "@playwright/test";

/**
 * One full-stack flow (Phase 14): load the real dashboard, select a
 * company, see its ratio breakdown, run the purification calculator —
 * exercising the ACTUAL wiring (Vite build/proxy, Fastify routes, real
 * Prisma queries against seeded data) end to end, not fakes.
 *
 * Assertions are deliberately STRUCTURAL, not hardcoded to specific
 * numbers: live market data means AAPL's exact debt ratio today will
 * differ from tomorrow. Asserting `purificationAmount + netAmount ==
 * dividendReceived` proves the full client -> server -> client math
 * pipeline is correctly wired, without depending on any particular
 * ratio value staying fixed between test runs.
 */

/** Finds the <dd> immediately following a <dt> with the given text —
 * robust to reordering within the definition list, unlike indexing by
 * position. */
async function ddAfterDt(page: Page, dtText: string): Promise<string> {
  const dt = page.locator("dt", { hasText: dtText });
  const dd = dt.locator("xpath=following-sibling::dd[1]");
  return (await dd.textContent()) ?? "";
}

test("select a stock, view its ratio breakdown, run the purification calculator", async ({
  page,
}) => {
  await page.goto("/");

  // The watchlist loads from a real GET /companies call.
  const aaplRow = page.getByTestId("stock-row-AAPL");
  await expect(aaplRow).toBeVisible();
  await aaplRow.click();

  const ratioBreakdown = page.getByTestId("ratio-breakdown");
  await expect(ratioBreakdown).toBeVisible();
  await expect(ratioBreakdown.getByRole("heading", { name: "AAPL" })).toBeVisible();
  // One of the four real compliance states must appear — which one
  // depends on live data, so we assert the SHAPE, not a specific value.
  await expect(
    ratioBreakdown.getByText(/^(Compliant|Non-compliant|Unknown|Pending)$/),
  ).toBeVisible();

  const calculator = page.getByTestId("purification-calculator");
  await expect(calculator).toBeVisible();
  await expect(
    calculator.getByRole("heading", { name: "Purification calculator — AAPL" }),
  ).toBeVisible();

  await calculator.getByLabel("Dividend received ($)").fill("1000");
  await calculator.getByRole("button", { name: "Calculate" }).click();

  await expect(calculator.getByText("You may keep")).toBeVisible();

  const purifyText = await ddAfterDt(page, "Amount to purify (donate)");
  const keepText = await ddAfterDt(page, "You may keep");

  if (purifyText === "Unknown") {
    // Genuinely unknown ratio is a valid, honest outcome too — but
    // both fields must agree it's unknown, not one number and one gap.
    expect(keepText).toBe("Unknown");
  } else {
    const purify = Number(purifyText.replace("$", ""));
    const keep = Number(keepText.replace("$", ""));
    expect(purify + keep).toBeCloseTo(1000, 2);
  }
});
