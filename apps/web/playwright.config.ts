import { defineConfig, devices } from "@playwright/test";

/**
 * Deliberately NOT wired into CI — see the Phase 14 discussion: running
 * this would mean putting real Neon/Upstash credentials into GitHub
 * Actions secrets, a genuine architectural decision deferred to when
 * it can't be avoided anyway (Phase 17 deploy). Run locally via
 * `npm run test:e2e -w @aqlis/web` against your real dev stack.
 *
 * Auto-starts BOTH the API server and the Vite dev server (see
 * webServer below) so a single command drives the whole flow — no
 * manual "start two terminals first" step.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // one deliberate flow — no need for worker parallelism
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm run dev -w @aqlis/server",
      cwd: "../..", // apps/web -> repo root, where the workspace command resolves
      url: "http://localhost:3000/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
