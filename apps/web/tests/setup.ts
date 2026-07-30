// Extends Vitest's `expect` with DOM-aware matchers like
// `toBeInTheDocument()`. Imported once here via setupFiles (vite.config.ts)
// rather than per-test-file.
import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/react auto-registers this itself ONLY when it finds
// a global `afterEach` (e.g. Vitest's `globals: true`). This project
// deliberately keeps `globals: false` — explicit imports everywhere,
// matching apps/server's convention — so cleanup must be wired by
// hand, or one test's rendered DOM silently leaks into the next.
afterEach(() => {
  cleanup();
});
