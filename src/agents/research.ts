import { Agent, AgentInput, AgentOutput, Env } from "../types";

/**
 * Research Agent
 * 
 * Gathers intelligence on a prospect company before a sales call.
 * 
 * Outputs structured data:
 * - company_name
 * - tech_stack
 * - recent_news
 * - competitors
 * - key_contacts (if available)
 * - cloud_opportunities (inferred gaps)
 */

export class ResearchAgent implements Agent {
  name = "research";
  maxIterations = 5;
  tools = []; // TODO: Add web scraper, news API tools

  systemPrompt = `You are a Cloudflare Solutions Engineer research specialist.
Your job is to gather intel on a prospect before a sales call.

You have access to: web search, news API, and company databases.

You MUST output valid JSON with these fields:
- company_name: string
- tech_stack: string[] (technologies they use, inferred from careers page, blog, etc.)
- recent_news: string[] (last 6 months)
- competitors: string[]
- key_contacts: { name: string, title: string }[] (if found)
- cloud_opportunities: string[] (how Cloudflare could help, based on their stack)
- reasoning: string (how you found this information)

If you cannot find information, set the field to null or an empty array.
Be concise but thorough. Focus on technical infrastructure and recent business moves.`;

  async execute(input: AgentInput, env: Env): Promise<AgentOutput> {
    const startTime = Date.now();

    try {
      // For now, we'll use Workers AI to simulate research
      // In production, this would call real tools (web scraper, news API, etc.)
      
      const prompt = `${this.systemPrompt}\n\nResearch this company: ${input.message}\n\nOutput JSON:`;

      const response = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
        prompt,
        max_tokens: 2000,
        temperature: 0.3,
      });

      const text = (response as { response?: string }).response || "";

      // Try to parse JSON from the response
      let data: unknown;
      try {
        // Extract JSON if it's wrapped in markdown code blocks
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : text;
        data = JSON.parse(jsonStr);
      } catch {
        // If JSON parsing fails, return the raw text as data
        data = { raw_response: text };
      }

      return {
        agent: this.name,
        status: "success",
        data,
        reasoning: "Used Workers AI to research company based on available training data. In production, this would call web scraper and news APIs.",
        sources: ["workers-ai-training-data"],
        confidence: 0.7, // Lower confidence since we're not using real tools yet
      };
    } catch (error) {
      console.error("ResearchAgent failed:", error);
      
      return {
        agent: this.name,
        status: "failure",
        data: null,
        reasoning: `Research failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        sources: [],
        confidence: 0,
      };
    }
  }
}
