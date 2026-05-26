import { z } from "zod";

// ─── Core Agent Types ───

export const AgentOutputSchema = z.object({
  agent: z.string(),
  status: z.enum(["success", "partial", "failure"]),
  data: z.unknown(),
  reasoning: z.string(),
  sources: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

export interface AgentInput {
  message: string;
  context?: Record<string, unknown>;
  sessionId: string;
}

export interface Agent {
  name: string;
  systemPrompt: string;
  tools: Tool[];
  maxIterations: number;
  execute: (input: AgentInput, env: Env) => Promise<AgentOutput>;
}

// ─── Tool Types ───

export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  execute: (params: unknown, env: Env) => Promise<unknown>;
}

// ─── Orchestrator Types ───

export interface CopilotRequest {
  session_id: string;
  message: string;
  context?: {
    company_name?: string;
    industry?: string;
    previous_outputs?: AgentOutput[];
  };
}

export interface CopilotResponse {
  session_id: string;
  agent: string;
  output: AgentOutput;
  latency_ms: number;
  tokens_used: number;
}

export type Intent =
  | "research"
  | "architecture"
  | "business_case"
  | "security"
  | "notes"
  | "clarification"
  | "unknown";

// ─── Environment Types ───

export interface Env {
  SESSION_KV: KVNamespace;
  AUDIT_DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  NEWS_API_KEY: string;
  CRUNCHBASE_API_KEY: string;
  OPENAI_API_KEY: string;
}
