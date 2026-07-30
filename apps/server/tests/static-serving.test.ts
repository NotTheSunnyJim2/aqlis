import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("static frontend serving", () => {
  let app: FastifyInstance | undefined;
  let tempDir: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "aqlis-static-test-"));
    writeFileSync(path.join(tempDir, "index.html"), "<html><body>Aqlis</body></html>");
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("serves the built frontend's index.html at / when staticRoot is provided", async () => {
    app = await buildApp({ logger: false, staticRoot: tempDir });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Aqlis");
  });

  it("still routes API endpoints correctly — static serving doesn't shadow them", async () => {
    app = await buildApp({ logger: false, staticRoot: tempDir });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
  });

  it("returns 404 for an unknown static path, not a crash", async () => {
    app = await buildApp({ logger: false, staticRoot: tempDir });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/nonexistent-asset.js" });

    expect(res.statusCode).toBe(404);
  });

  it("does not register static serving at all when staticRoot is omitted", async () => {
    app = await buildApp({ logger: false }); // no staticRoot — dev/test mode
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/" });

    // No static plugin registered, no route for "/" — falls through to
    // Fastify's default 404, proving it wasn't silently mis-wired.
    expect(res.statusCode).toBe(404);
  });
});
