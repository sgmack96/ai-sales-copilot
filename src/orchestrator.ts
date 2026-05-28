import { Env, Intent, AgentInput, AgentOutput, CopilotRequest, CopilotResponse } from "./types";
import { ResearchAgent } from "./agents/research";
import { ArchitectureAgent } from "./agents/architecture";

/**
 * Orchestrator: The brain of the co-pilot.
 *
 * Responsibilities:
 * 1. Classify user intent (keyword-first, LLM fallback)
 * 2. Route to the appropriate agent
 * 3. Store results in memory
 * 4. Log to audit database
 * 5. Return structured response
 *
 * Performance note (2026-05-27):
 * Switched from LLM-only intent classification to keyword pre-classifier.
 * Saves 5-10s per request by skipping the LLM call for obvious patterns.
 * LLM classification is still used as fallback for ambiguous messages.
 */

// ─── Keyword patterns for fast intent classification ────────
// These skip the 5-10s LLM call when the intent is obvious.

const ARCHITECTURE_PATTERNS = [
  /\b(architect|architecture|design|stack|migrate|migration|replacement?|alternative|equivalent|replaces?|switch from|move from|instead of)\b/i,
  /\b(using|use|on|running|run)\s+(aws|azure|gcp|google cloud|vercel|netlify|akamai|fastly)/i,
  /\bwhat\s+(replaces?|is the|cloudflare)\b/i,
  /\b(lambda|cloudfront|s3|rds|ec2|dynamodb|elasticache|cognito|route\s*53)\b/i,
  /\b(vpn|mpls|sd-wan|zscaler|palo alto|cisco|okta|auth0|prisma)\b/i,
];

const RESEARCH_PATTERNS = [
  /\b(research|look up|find out|tell me about|who is|what does|company|prospect|background)\b/i,
  /\b(crunchbase|linkedin|funding|revenue|employees|founded|headquarters)\b/i,
];

export class Orchestrator {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async handle(request: CopilotRequest): Promise<CopilotResponse> {
    const startTime = Date.now();

    // Step 1: Classify intent (keyword-first, LLM fallback)
    const intent = await this.classifyIntent(request.message);
    console.log(`[Orchestrator] Intent: ${intent} (${Date.now() - startTime}ms)`);

    // Step 2: Load session memory (non-blocking with agent routing)
    const session = await this.loadSession(request.session_id);

    // Step 3: Route to agent
    const agentInput: AgentInput = {
      message: request.message,
      sessionId: request.session_id,
      context: {
        ...request.context,
        session_history: session.history,
      },
    };

    const agentOutput = await this.routeToAgent(intent, agentInput);

    // Step 4: Store in memory (fire-and-forget — don't block response)
    const storePromise = this.storeSession(request.session_id, {
      ...session,
      history: [
        ...session.history,
        { role: "user", content: request.message },
        { role: "agent", content: agentOutput },
      ],
    });

    // Step 5: Log to audit DB (fire-and-forget)
    const auditPromise = this.logAudit(
      request.session_id,
      intent,
      agentInput,
      agentOutput,
      Date.now() - startTime
    );

    // Wait for storage ops but don't block if they fail
    await Promise.allSettled([storePromise, auditPromise]);

    // Step 6: Return response
    return {
      session_id: request.session_id,
      agent: intent,
      output: agentOutput,
      latency_ms: Date.now() - startTime,
      tokens_used: 0, // TODO: track tokens
    };
  }

  /**
   * Classify user intent.
   *
   * Strategy: keyword pre-classifier first (0ms), LLM fallback for ambiguous (~5-10s).
   * This saves 5-10 seconds on every request where the intent is obvious.
   */
  private async classifyIntent(message: string): Promise<Intent> {
    // Fast path: keyword matching
    const keywordIntent = this.keywordClassify(message);
    if (keywordIntent) {
      console.log(`[Orchestrator] Keyword match: ${keywordIntent}`);
      return keywordIntent;
    }

    // Slow path: LLM classification for ambiguous messages
    console.log("[Orchestrator] No keyword match, falling back to LLM classification");
    return this.llmClassify(message);
  }

  /**
   * Fast keyword-based intent classification.
   * Returns null if no confident match — falls through to LLM.
   */
  private keywordClassify(message: string): Intent | null {
    // Check architecture patterns first (most common use case)
    if (ARCHITECTURE_PATTERNS.some((p) => p.test(message))) {
      return "architecture";
    }

    // Check research patterns
    if (RESEARCH_PATTERNS.some((p) => p.test(message))) {
      return "research";
    }

    return null; // Ambiguous — fall through to LLM
  }

  /**
   * LLM-based intent classification (fallback).
   * Only called when keyword matching fails.
   */
  private async llmClassify(message: string): Promise<Intent> {
    const prompt = `You are an intent classifier for a technical sales co-pilot.

Classify the following user message into one of these intents:
- "research": User wants to research a company or prospect
- "architecture": User wants to design or review a tech architecture
- "business_case": User wants ROI, pricing, or business justification
- "security": User wants security analysis or compliance mapping
- "notes": User wants to structure call notes or CRM entries
- "clarification": The request is unclear and needs follow-up
- "unknown": None of the above

Respond with ONLY the intent label, nothing else.

User message: "${message}"

Intent:`;

    try {
      const response = await this.env.AI.run("@cf/meta/llama-3-8b-instruct", {
        prompt,
        max_tokens: 10,
        temperature: 0.1,
      });

      const intent = (response as { response?: string }).response?.trim().toLowerCase() || "unknown";

      const validIntents: Intent[] = [
        "research", "architecture", "business_case", "security",
        "notes", "clarification", "unknown",
      ];
      return validIntents.includes(intent as Intent) ? (intent as Intent) : "unknown";
    } catch (error) {
      console.error("LLM intent classification failed:", error);
      return "unknown";
    }
  }

  /**
   * Route to the appropriate agent based on intent.
   */
  private async routeToAgent(intent: Intent, input: AgentInput): Promise<AgentOutput> {
    switch (intent) {
      case "research":
        return new ResearchAgent().execute(input, this.env);
      case "architecture":
        return new ArchitectureAgent().execute(input, this.env);
      default:
        return {
          agent: "orchestrator",
          status: "failure",
          data: null,
          reasoning: `No agent available for intent: ${intent}`,
          sources: [],
          confidence: 0,
        };
    }
  }

  /**
   * Load session state from KV.
   */
  private async loadSession(
    sessionId: string
  ): Promise<{ history: Array<{ role: string; content: unknown }> }> {
    try {
      const session = await this.env.SESSION_KV.get(sessionId, "json");
      return (
        (session as { history: Array<{ role: string; content: unknown }> }) || {
          history: [],
        }
      );
    } catch {
      return { history: [] };
    }
  }

  /**
   * Store session state in KV.
   */
  private async storeSession(sessionId: string, session: unknown): Promise<void> {
    await this.env.SESSION_KV.put(sessionId, JSON.stringify(session));
  }

  /**
   * Log agent run to D1 audit database.
   */
  private async logAudit(
    sessionId: string,
    agent: string,
    input: AgentInput,
    output: AgentOutput,
    latencyMs: number
  ): Promise<void> {
    try {
      await this.env.AUDIT_DB.prepare(
        `INSERT INTO agent_runs (session_id, agent_name, input, output, latency_ms)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(sessionId, agent, JSON.stringify(input), JSON.stringify(output), latencyMs)
        .run();
    } catch (error) {
      console.error("Audit logging failed:", error);
    }
  }
}
