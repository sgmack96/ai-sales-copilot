import { Hono } from "hono";
import { Orchestrator } from "./orchestrator";
import { CopilotRequest, Env } from "./types";
import { seedVectorize } from "./seed";

/**
 * AI Sales Co-Pilot
 *
 * Entry point: Cloudflare Worker using Hono framework.
 *
 * Routes:
 * - POST /api/v1/copilot    Main co-pilot endpoint
 * - GET  /health            Health check
 * - GET  /session/:id       Get session history
 * - POST /admin/seed        Seed Vectorize index with product docs
 */

const app = new Hono<{ Bindings: Env }>();

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "0.2.0",
    agents: ["research", "architecture"],
    timestamp: new Date().toISOString(),
  });
});

// Main co-pilot endpoint
app.post("/api/v1/copilot", async (c) => {
  try {
    const body = await c.req.json<CopilotRequest>();

    // Validate required fields
    if (!body.session_id || !body.message) {
      return c.json(
        { error: "Missing required fields: session_id, message" },
        400
      );
    }

    const orchestrator = new Orchestrator(c.env);
    const response = await orchestrator.handle(body);

    return c.json(response);
  } catch (error) {
    console.error("Co-pilot error:", error);
    return c.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown",
      },
      500
    );
  }
});

// Get session history
app.get("/session/:id", async (c) => {
  try {
    const sessionId = c.req.param("id");
    const session = await c.env.SESSION_KV.get(sessionId, "json");

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json(session);
  } catch (error) {
    console.error("Session fetch error:", error);
    return c.json({ error: "Failed to fetch session" }, 500);
  }
});

// ─── Admin: Seed Vectorize ──────────────────────────────────

/**
 * POST /admin/seed
 *
 * Embeds all 80 product chunks and upserts them to the Vectorize index.
 * Run this after deploying or whenever product docs change.
 *
 * Usage:
 *   curl -X POST https://ai-sales-copilot.stephenmack96.workers.dev/admin/seed
 *
 * Response:
 *   { total_chunks: 80, embedded: 80, upserted: 80, errors: [], duration_ms: 3200 }
 */
app.post("/admin/seed", async (c) => {
  try {
    console.log("[Admin] Starting Vectorize seed...");
    const result = await seedVectorize(c.env);

    const status = result.errors.length === 0 ? 200 : 207; // 207 Multi-Status if partial
    return c.json(result, status);
  } catch (error) {
    console.error("[Admin] Seed failed:", error);
    return c.json(
      {
        error: "Seed failed",
        details: error instanceof Error ? error.message : "Unknown",
      },
      500
    );
  }
});

/**
 * GET /admin/seed/status
 *
 * Quick check: query Vectorize for a known chunk to verify the index is seeded.
 */
app.get("/admin/seed/status", async (c) => {
  try {
    // Embed a test query
    const embedding = await c.env.AI.run("@cf/baai/bge-base-en-v1.5", {
      text: "serverless compute",
    });

    const results = await c.env.VECTORIZE.query(
      (embedding as { data: number[][] }).data[0],
      {
        topK: 3,
        returnMetadata: "all",
      }
    );

    const matches = results.matches || [];

    return c.json({
      indexed: matches.length > 0,
      sample_results: matches.map((m) => ({
        id: m.id,
        score: m.score,
        product: m.metadata?.product,
        type: m.metadata?.type,
      })),
    });
  } catch (error) {
    return c.json({
      indexed: false,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }
});

export default app;
