// `defineConfig` from vitest/config (not plain "vite") re-exports Vite's
// own defineConfig with an extended type that also understands the
// `test` key below — same file configures both the dev server and the
// test runner, since Vitest IS built on Vite.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // Explicit, not Vitest's broad default glob: without this, Vitest
    // would ALSO try to run e2e/dashboard.spec.ts (matches the default
    // *.spec.ts pattern) as one of its own tests — it imports from
    // @playwright/test, not vitest, so that fails confusingly. Scoping
    // to tests/ makes the unit-vs-e2e boundary unambiguous.
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  server: {
    proxy: {
      // Dev-only convenience: same-origin fetches to the API server,
      // avoiding CORS entirely rather than configuring it (Fly.io
      // deploy will actually serve both from one origin — see ADR
      // when we reach Phase 17). WebSocket upgrades need ws: true.
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
});
