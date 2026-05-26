# Architecture Overview

> **Date:** 2026-05-26  
> **Topic:** System design, data flow, API contracts  
> **Status:** Draft — open to revision

---

## System Diagram

```
                    ┌─────────────────────┐
                    │   CLIENT REQUEST    │
                    │  "Research Stripe"  │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   CLOUDFLARE EDGE   │
                    │   (Hono Worker)     │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
     │  ORCHESTRATOR │ │  MEMORY KV  │ │   AUDIT D1  │
     │               │ │             │ │             │
     │ 1. Classify   │ │ Session     │ │ Agent runs  │
     │    intent     │ │ state       │ │ & results   │
     │ 2. Route to   │ │             │ │             │
     │    agent      │ │             │ │             │
     │ 3. Merge      │ │             │ │             │
     │    output     │ │             │ │             │
     └───────┬───────┘ └─────────────┘ └─────────────┘
             │
    ┌────────┼────────┬────────┬────────┐
    │        │        │        │        │
┌───▼───┐ ┌──▼───┐ ┌──▼───┐ ┌──▼───┐ ┌─▼────┐
│Research│ │Arch. │ │Biz   │ │Sec.  │ │Notes │
│ Agent  │ │Agent │ │Case  │ │Agent │ │Agent │
└───┬────┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘
    │         │        │        │        │
    └─────────┴────────┴────────┴────────┘
                    │
         ┌──────────▼──────────┐
         │     TOOL LAYER      │
         │  - Web Scraper      │
         │  - News API         │
         │  - Vectorize RAG    │
         │  - Diagram Gen      │
         │  - CRM API          │
         └─────────────────────┘
```

---

## API Contract

### Entry Point

```typescript
// POST /api/v1/copilot
interface CopilotRequest {
  session_id: string;        // UUID for conversation memory
  message: string;           // User input
  context?: {
    company_name?: string;   // If already known
    industry?: string;
    previous_outputs?: AgentOutput[];
  };
}

interface CopilotResponse {
  session_id: string;
  agent: string;             // Which agent handled it
  output: AgentOutput;
  latency_ms: number;
  tokens_used: number;
}
```

### Agent Output Schema

Every agent MUST return this structure:

```typescript
interface AgentOutput {
  agent: string;
  status: "success" | "partial" | "failure";
  data: unknown;             // Agent-specific structured data
  reasoning: string;         // Why it made its decisions
  sources: string[];         // URLs, docs referenced
  confidence: number;        // 0-1
}
```

**Why this matters:** The Orchestrator doesn't care what's in `data`. It just needs to know `status`, `confidence`, and how to render it. This decouples agents from the frontend.

---

## Data Flow Examples

### Flow 1: Research Request

```
User: "Research Stripe"
  ↓
Orchestrator.classify("Research Stripe") → "research"
  ↓
ResearchAgent.run({ company: "Stripe" })
  ↓
  ├─ Tool: web_scraper("stripe.com")
  ├─ Tool: news_api("Stripe recent news")
  ├─ Tool: crunchbase("Stripe")
  ↓
ResearchAgent returns:
  {
    agent: "research",
    status: "success",
    data: {
      company_name: "Stripe",
      tech_stack: ["Ruby", "AWS", "CloudFront"],
      recent_news: ["Stripe launches new Treasury API"],
      competitors: ["Adyen", "Square", "PayPal"]
    },
    reasoning: "Scraped careers page for tech stack, searched news for recent developments",
    sources: ["stripe.com", "techcrunch.com/..."],
    confidence: 0.92
  }
  ↓
Orchestrator stores in KV
Orchestrator logs to D1
Orchestrator returns to user
```

### Flow 2: Multi-Agent Workflow (Future)

```
User: "Prep me for my Stripe call"
  ↓
Orchestrator.classify("Prep me for my Stripe call") → "full_prep"
  ↓
Orchestrator spawns parallel agents:
  ├─ ResearchAgent (company: "Stripe")
  ├─ ArchitectureAgent (company: "Stripe", current_stack: ["AWS", "CloudFront"])
  └─ BusinessCaseAgent (company: "Stripe", use_case: "edge_compute")
  ↓
Wait for all to complete
  ↓
Merge outputs into unified brief
  ↓
Return structured brief to user
```

---

## Technology Choices

| Layer | Technology | Why |
|-------|-----------|-----|
| **Runtime** | Cloudflare Workers | Edge deployment, sub-50ms cold start, global |
| **Router** | Hono | Lightweight, TypeScript-native, middleware support |
| **LLM** | Workers AI (Llama/Mistral) | Free tier, no API keys, edge-local |
| **Fallback** | AI Gateway → OpenAI/Anthropic | If Workers AI fails or we need GPT-4 |
| **Memory** | KV | Session state, fast global read |
| **Database** | D1 | Audit logs, relational queries |
| **Vector DB** | Vectorize | RAG on Cloudflare product docs |
| **Validation** | Zod | Runtime type safety, structured outputs |
| **Testing** | Vitest | Fast, native ESM, works with Workers |

---

## Error Handling Strategy

### Agent-Level

```typescript
class AgentRunner {
  async run(input: AgentInput): Promise<AgentOutput> {
    try {
      const result = await this.agent.execute(input);
      return {
        status: "success",
        data: result,
        confidence: this.calculateConfidence(result)
      };
    } catch (error) {
      // Log failure
      await this.audit.log({ agent: this.name, error });
      
      // Return partial if we have some data
      if (error.partialData) {
        return {
          status: "partial",
          data: error.partialData,
          confidence: 0.3
        };
      }
      
      // Total failure
      return {
        status: "failure",
        data: null,
        confidence: 0
      };
    }
  }
}
```

### Orchestrator-Level

```typescript
if (output.status === "failure") {
  // Retry with different model
  const fallback = await aiGateway.route({
    primary: "workers-ai",
    fallback: "openai"
  });
}

if (output.confidence < 0.5) {
  // Ask user for clarification
  return {
    type: "clarification",
    message: "I wasn't confident about their tech stack. Can you confirm?"
  };
}
```

---

## Security Considerations

1. **API Keys**: Store in Workers Secrets (`wrangler secret put`), never in code
2. **Rate Limiting**: Cloudflare built-in + custom per-user limits
3. **PII**: Don't log customer names/email in D1 without hashing
4. **Output Validation**: Zod schema validation on ALL agent outputs
5. **Prompt Injection**: Guardrails layer (Week 3 topic)

---

## Checkpoint Questions

1. Why does every agent return the same `AgentOutput` structure?
2. What's the difference between KV and D1 in our architecture?
3. When would the Orchestrator use AI Gateway fallback?
4. How do we handle partial failures?
5. What's the API contract between the Orchestrator and agents?

Write your answers in: `notes/checkpoint-02-architecture.md`

---

*Next: Start building the orchestrator and first agent (Research Agent)*
