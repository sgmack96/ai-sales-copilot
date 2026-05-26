import { Hono } from "hono";
import { Orchestrator } from "./orchestrator";
import { CopilotRequest, Env } from "./types";

/**
 * AI Sales Co-Pilot
 * 
 * Entry point: Cloudflare Worker using Hono framework.
 * 
 * Routes:
 * - POST /api/v1/copilot    Main entry point
 * - GET  /health            Health check
 * - GET  /session/:id       Get session history
 */

const app = new Hono<{ Bindings: Env }>();

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "0.1.0",
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
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" },
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

export default app;
