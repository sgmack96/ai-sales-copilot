import { Env, Intent, AgentInput, AgentOutput, CopilotRequest, CopilotResponse } from "./types";
import { ResearchAgent } from "./agents/research";

/**
 * Orchestrator: The brain of the co-pilot.
 * 
 * Responsibilities:
 * 1. Classify user intent
 * 2. Route to the appropriate agent
 * 3. Store results in memory
 * 4. Log to audit database
 * 5. Return structured response
 */

export class Orchestrator {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async handle(request: CopilotRequest): Promise<CopilotResponse> {
    const startTime = Date.now();

    // Step 1: Classify intent
    const intent = await this.classifyIntent(request.message);

    // Step 2: Load session memory
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

    // Step 4: Store in memory
    await this.storeSession(request.session_id, {
      ...session,
      history: [...session.history, { role: "user", content: request.message }, { role: "agent", content: agentOutput }],
    });

    // Step 5: Log to audit DB
    await this.logAudit(request.session_id, intent, agentInput, agentOutput, Date.now() - startTime);

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
   * Classify user intent using Workers AI.
   * This is a simple zero-shot classification.
   * In production, you'd fine-tune or use embeddings.
   */
  private async classifyIntent(message: string): Promise<Intent> {
    const prompt = `You are an intent classifier for a technical sales co-pilot.

Classify the following user message into one of these intents:
- "research": User wants to research a company or prospect
- "architecture": User wants to design or review an architecture
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

      // Validate against known intents
      const validIntents: Intent[] = ["research", "architecture", "business_case", "security", "notes", "clarification", "unknown"];
      return validIntents.includes(intent as Intent) ? (intent as Intent) : "unknown";
    } catch (error) {
      console.error("Intent classification failed:", error);
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
      // TODO: Add other agents
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
  private async loadSession(sessionId: string): Promise<{ history: Array<{ role: string; content: unknown }> }> {
    try {
      const session = await this.env.SESSION_KV.get(sessionId, "json");
      return session as { history: Array<{ role: string; content: unknown }> } || { history: [] };
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
      ).bind(
        sessionId,
        agent,
        JSON.stringify(input),
        JSON.stringify(output),
        latencyMs
      ).run();
    } catch (error) {
      console.error("Audit logging failed:", error);
      // Don't fail the request if audit logging fails
    }
  }
}
