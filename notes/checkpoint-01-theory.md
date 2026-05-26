# Checkpoint 01: Theory — Multi-Agent Systems & ReAct

> **Date:** 2026-05-26  
> **Topic:** ReAct paper, multi-agent architecture, memory systems  
> **Status:** Complete

---

## What I Learned

**Multi-agent vs single prompt:** Just like microservices vs monoliths. Each agent has a narrow scope, specific tools, and can be evaluated independently. If one fails, the others keep working. You can also run them in parallel.

**ReAct loop:** Three components — **Thought** (reasoning), **Action** (tool call), **Observation** (result). The agent thinks about what to do, does it, sees what happened, then thinks again. This loop lets agents recover from mistakes and plan multi-step tasks.

**System prompts:** They're API contracts. Good ones specify role, scope, available tools, output format, and error handling. The more explicit, the more reliable the agent.

---

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Agent architecture | Multi-agent with orchestrator | Separation of concerns, fault isolation, parallelization |
| Orchestrator pattern | Intent classification | Simple, fast, debuggable. Will evolve to supervisor later |
| Output format | JSON with Zod validation | Structured = parseable = reliable |
| Memory | KV + D1 together | KV for fast session state, D1 for queryable audit logs |

---

## Deep Dive: KV vs D1 — What I Got Wrong (And Why It Matters)

### My Original Answer (Confused)
> "key value are good for short key values databses where we can vectorize certain infromation... D1 for durable objects is good for maintain state..."

**The fix:** I mixed up three different Cloudflare products:

| Product | What It Actually Is | What We Use It For |
|---------|--------------------|--------------------|
| **KV** | Global key-value store (like Redis) | Session state — conversation history, context |
| **D1** | SQLite database | Audit logs — structured, queryable records of every agent run |
| **Vectorize** | Vector database (for embeddings/RAG) | Semantic search over Cloudflare product docs |
| **Durable Objects** | Stateful coordination (not using this) | — |

### Why Both KV and D1?

**KV for Session State:**
```
Key: "session_abc123"
Value: {
  messages: [...],
  context: { company: "Stripe", last_agent: "research" }
}
```
- Reads in < 50ms globally
- Eventually consistent (fine for chat)
- 25MB max value = plenty for conversation history
- **Perfect for:** "What did we just talk about?"

**D1 for Audit Logs:**
```sql
SELECT agent_name, AVG(latency_ms) 
FROM agent_runs 
WHERE created_at > datetime('now', '-7 days')
GROUP BY agent_name;
```
- SQL = ask complex questions about performance
- Relational = link runs to sessions, track failure rates
- **Perfect for:** "How many research agents failed this week?"

### The Real Distinction

| Need | Right Tool | Wrong Tool |
|------|-----------|-----------|
| Fast chat history lookup | KV | D1 (too slow for real-time) |
| "Show me all failed runs" | D1 | KV (can't query across keys) |
| Semantic doc search | Vectorize | KV or D1 |
| Coordinated game state | Durable Objects | KV (eventual consistency = race conditions) |

**Sources:**
- [Cloudflare KV Documentation](https://developers.cloudflare.com/kv/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Vectorize Documentation](https://developers.cloudflare.com/vectorize/)

---

## Questions I Still Have

1. When should we switch from intent classification to a supervisor pattern?
2. How do we handle KV consistency if a user sends two messages in rapid succession?
3. What's the cost difference between KV reads and D1 queries at scale?

---

## Links & Resources

- [ReAct Paper](https://arxiv.org/abs/2210.03629) — Sections 3-4
- [LangGraph Multi-Agent Patterns](https://langchain-ai.github.io/langgraph/concepts/multi_agent/)
- [Cloudflare Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)

---

## Next Steps

1. Build real tools for Research Agent (web scraper, news API)
2. Add Architecture Agent with Vectorize RAG
3. Test end-to-end flow with `wrangler dev`
