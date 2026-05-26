# Theory: Multi-Agent Systems & ReAct Patterns

> **Date:** 2026-05-26  
> **Topic:** Why multi-agent? Why ReAct? What are we actually building?  
> **Reading time:** 15 min  
> **Status:** Foundation checkpoint

---

## 1. The Core Question: Why Multi-Agent?

You could build this sales co-pilot as a single LLM prompt:

```
"You are a Solutions Engineer. Research this company, design an architecture, 
and write call notes."
```

**So why split it into agents?**

### Reason 1: Separation of Concerns
Just like you don't write a monolith in production, you don't give a monolith prompt to an LLM. Each agent has:
- A **narrow scope** (research *only*)
- A **specific toolset** (web scraper, not diagram generator)
- **Clearer evaluation** (is the research good? evaluate just that)

### Reason 2: Composability
You can reuse the Research Agent for *any* project. The Architecture Agent works for any cloud provider. Agents become building blocks.

### Reason 3: Fault Isolation
If the Business Case Agent hallucinates a price, the Research Agent's output is still valid. In a monolith prompt, one error poisons everything.

### Reason 4: Parallelization
Research + Architecture can run simultaneously. The Orchestrator merges results. You can't do that in a single prompt.

**Sources:**
- [Multi-Agent Reinforcement Learning: An Overview](https://arxiv.org/abs/2312.0887) — survey paper on why multi-agent beats single-agent in complex tasks
- [CrewAI Documentation — Why Multi-Agent?](https://docs.crewai.com/core-concepts/Agents/)
- [LangGraph Multi-Agent Workflows](https://langchain-ai.github.io/langgraph/concepts/multi_agent/)

---

## 2. The ReAct Pattern: Reasoning + Acting

ReAct = **Re**asoning + **Act**ing

It's not enough for an agent to *do* things. It needs to *think* about what to do next.

### The Loop

```
Thought: "I need to research Acme Corp's tech stack. I should search their website."
  ↓
Action: search_website("acme.com")
  ↓
Observation: "Acme Corp uses AWS Lambda, CloudFront, and Auth0."
  ↓
Thought: "They use CloudFront but not Workers. I should check if they have any edge compute needs."
  ↓
Action: search_news("Acme Corp edge compute latency")
  ↓
Observation: [news articles about their global expansion]
  ↓
... (loop continues)
```

### Why This Matters for Our Co-Pilot

A Research Agent that just calls tools randomly is useless. It needs to:
1. **Plan** what to research (website → news → competitors → tech stack)
2. **Reflect** on what it found ("They use CloudFront → edge opportunity")
3. **Decide** when it has enough (stop condition)

**The ReAct paper:**
- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) — Yao et al., 2022. The foundational paper. Read Section 3 (Method) and Section 4 (Experiments on HotPotQA and FEVER).

**Cloudflare-native implementation:**
- Workers AI + AI Gateway → run the reasoning step
- KV → store the loop state (thought, action, observation)
- D1 → audit log of every reasoning step

---

## 3. Agent Architecture: The Anatomy

Every agent in our system follows this pattern:

```typescript
interface Agent {
  name: string;
  systemPrompt: string;      // Who you are, what you do
  tools: Tool[];             // What you can call
  maxIterations: number;     // Stop after N loops
  outputSchema: z.ZodSchema; // Structured output validation
}
```

### System Prompt Design

Bad:
```
"You are a research agent."
```

Good:
```
"You are a Cloudflare Solutions Engineer research specialist. 
Your job is to gather intel on a prospect before a sales call. 
You have access to: web search, news API, Crunchbase. 
You MUST output valid JSON with these fields: company_name, tech_stack, 
recent_news, competitors, key_contacts. 
If you cannot find information, set the field to null."
```

**Key insight:** The system prompt is your API contract. Be explicit about:
- Role and scope
- Available tools
- Output format
- Error handling

---

## 4. Orchestrator Patterns

How do you decide which agent runs when?

### Pattern A: Intent Classification (What We're Using)

```
User: "Research Stripe for me"
  ↓
Orchestrator: classify_intent("Research Stripe for me") → "research"
  ↓
Route to Research Agent
```

Pros: Simple, fast, easy to debug  
Cons: No multi-step workflows

### Pattern B: Supervisor Agent (LangGraph)

A "supervisor" agent decides which worker agent to call next based on the current state.

```
User: "Prep me for my Stripe call"
  ↓
Supervisor: "I need research + architecture + business case"
  ↓
Call Research Agent → wait
Call Architecture Agent → wait
Call Business Case Agent → wait
  ↓
Merge outputs → return
```

Pros: Can handle complex multi-step tasks  
Cons: More complex state management

### Pattern C: Collaborative (CrewAI)

Agents talk to each other. Research Agent says: "I found they use Lambda." Architecture Agent responds: "That means we should emphasize Workers' cold start advantage."

Pros: Emergent reasoning  
Cons: Expensive, slower, harder to debug

**Our choice:** Start with Pattern A (intent classification), evolve to Pattern B (supervisor) once we need multi-agent workflows.

**Sources:**
- [LangGraph Multi-Agent Architectures](https://langchain-ai.github.io/langgraph/concepts/multi_agent/)
- [CrewAI Core Concepts](https://docs.crewai.com/core-concepts/Agents/)
- [AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation](https://arxiv.org/abs/2308.08155) — Microsoft Research

---

## 5. Memory: Why KV and D1?

### Conversation Memory (KV)
Each user session gets a KV key. We store:
```json
{
  "session_id": "abc123",
  "messages": [
    {"role": "user", "content": "Research Stripe"},
    {"role": "agent", "content": "{...research output...}"}
  ],
  "context": {
    "current_company": "Stripe",
    "last_agent": "research"
  }
}
```

Why KV?
- Global replication (< 1s consistency is fine for chat)
- Key-value = perfect for session state
- 25MB max value = plenty for conversation history

### Audit Log (D1)
Every agent action gets logged:
```sql
CREATE TABLE agent_runs (
  id INTEGER PRIMARY KEY,
  session_id TEXT,
  agent_name TEXT,
  input TEXT,
  output TEXT,
  tools_used TEXT,
  latency_ms INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Why D1?
- SQL = easy to query "how many times did the research agent fail?"
- Relational = link runs to sessions, users, outcomes
- Cheap: $5/million reads, $1/million writes

**Sources:**
- [Cloudflare KV Documentation](https://developers.cloudflare.com/kv/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Memory in LLM Systems](https://blog.langchain.dev/memory-for-context/) — LangChain blog

---

## 6. Evaluation: How Do We Know It's Good?

This is Week 3 territory, but worth thinking about now.

### Metrics per Agent

| Agent | Metric | How to Measure |
|-------|--------|---------------|
| Research | Accuracy | Did it find the right tech stack? (Ground truth from LinkedIn) |
| Architecture | Completeness | Did it cover all their current infra? |
| Business Case | Plausibility | Does the ROI math make sense? |
| Notes | Structure | Do they parse into Salesforce correctly? |

### LLM-as-Judge

Use a second LLM to evaluate the first:

```
Judge Prompt: "Rate this research output 1-5 on accuracy, 
completeness, and actionability. Explain your reasoning."
```

**Sources:**
- [Evaluating LLM Systems](https://hamel.dev/blog/posts/evals/) — Hamel Husain
- [LLM-as-Judge: A Survey](https://arxiv.org/abs/2311.01209)
- [Cloudflare Evals Documentation](https://developers.cloudflare.com/workers-ai/evaluation/)

---

## 7. Key Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multi-agent vs single prompt | Multi-agent | Separation of concerns, fault isolation, reusability |
| Orchestrator pattern | Intent classification (for now) | Simple, fast, debuggable. Will evolve to supervisor |
| Memory | KV for session, D1 for audit | KV = fast session state. D1 = queryable logs |
| Framework | Hono + raw Workers AI (not LangChain) | Learn the primitives first. Add LangGraph later if needed |
| Output format | JSON (Zod validation) | Structured = parseable = reliable |

---

## 8. Reading List (In Order)

1. **ReAct Paper** (30 min) — [arXiv:2210.03629](https://arxiv.org/abs/2210.03629) — THE paper. Read Sections 3-4.
2. **LangGraph Multi-Agent** (15 min) — [Concepts](https://langchain-ai.github.io/langgraph/concepts/multi_agent/) — Visual overview of patterns.
3. **CrewAI Docs** (15 min) — [Core Concepts](https://docs.crewai.com/core-concepts/Agents/) — See how a framework abstracts agents.
4. **Hamel Husain on Evals** (20 min) — [Blog post](https://hamel.dev/blog/posts/evals/) — Why evaluation matters and how to do it.
5. **Cloudflare Workers AI** (15 min) — [Docs](https://developers.cloudflare.com/workers-ai/) — Understand what models and features we have.

**Total reading time:** ~1.5 hours  
**Do this before writing any agent code.**

---

## Checkpoint Questions

Before moving to architecture design, answer these:

1. Why is multi-agent better than a single LLM prompt for our use case?
2. What are the 3 components of the ReAct loop?
3. What's the difference between KV and D1, and why do we use both?
4. What makes a good system prompt?
5. How will we know if our agents are working well?

Write your answers in a new file: `notes/checkpoint-01-theory.md`

---

*Next: `notes/02-architecture-overview.md` — system design, data flow, API contracts*
