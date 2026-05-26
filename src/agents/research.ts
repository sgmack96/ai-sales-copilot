import { Agent, AgentInput, AgentOutput, Env } from "../types";
import { WebSearchTool } from "../tools/web-search";
import { WebScraperTool } from "../tools/web-scraper";
import { NewsAPITool } from "../tools/news-api";

/**
 * Research Agent
 * 
 * Gathers real intelligence on a prospect company using live tools:
 * - Web search (DuckDuckGo)
 * - Web scraping (company website)
 * - News API (recent articles)
 * 
 * Then synthesizes raw data into structured output using Workers AI.
 */

export class ResearchAgent implements Agent {
  name = "research";
  maxIterations = 5;
  tools = [WebSearchTool, WebScraperTool, NewsAPITool];

  systemPrompt = `You are a Cloudflare Solutions Engineer research analyst.
Your job is to synthesize raw research data into a structured company profile.

You will receive:
- Web search results
- Scraped text from the company website
- Recent news articles

Synthesize this into valid JSON with these fields:
- company_name: string (official name)
- website: string (main URL)
- description: string (1-2 sentence summary of what they do)
- tech_stack: string[] (technologies they use, inferred from careers page, blog, docs)
- recent_news: string[] (key headlines from last 6 months, max 5)
- competitors: string[] (main competitors mentioned)
- cloud_opportunities: string[] (specific ways Cloudflare could help, based on their stack)
- reasoning: string (summary of your analysis process)

Focus on:
1. What does the company do? (product/service)
2. What infrastructure do they use? (cloud provider, CDN, security tools)
3. What's happening recently? (launches, funding, expansion)
4. Where does Cloudflare fit? (performance, security, AI, edge compute)

If you cannot determine something, use null or empty arrays.
Output ONLY valid JSON, no markdown formatting.`;

  async execute(input: AgentInput, env: Env): Promise<AgentOutput> {
    const startTime = Date.now();
    const companyName = this.extractCompanyName(input.message);

    try {
      // === PHASE 1: Gather Raw Data with Tools ===
      
      // 1. Search for the company's main website
      const searchResults = await WebSearchTool.execute(
        { query: `${companyName} official website`, numResults: 3 },
        env
      ) as { results?: Array<{ title: string; url: string; snippet: string }>; error?: string };

      if (searchResults.error || !searchResults.results?.length) {
        throw new Error(`Could not find website for ${companyName}`);
      }

      const mainResult = searchResults.results[0];
      const websiteUrl = mainResult.url;

      // 2. Scrape their website
      const scraped = await WebScraperTool.execute(
        { url: websiteUrl, maxLength: 8000 },
        env
      ) as { text?: string; title?: string; error?: string };

      // 3. Get recent news
      const news = await NewsAPITool.execute(
        { query: companyName, days: 180, maxResults: 5 },
        env
      ) as { articles?: Array<{ title: string; description: string; url: string; publishedAt: string; source: string }>; error?: string };

      // === PHASE 2: Synthesize with Workers AI ===

      const rawData = {
        company_name: companyName,
        website: websiteUrl,
        search_results: searchResults.results.map(r => ({
          title: r.title,
          snippet: r.snippet,
        })),
        website_content: scraped.error ? `Error: ${scraped.error}` : scraped.text?.slice(0, 4000),
        website_title: scraped.title,
        news_articles: news.error ? [] : news.articles?.map(a => ({
          title: a.title,
          description: a.description,
          source: a.source,
          date: a.publishedAt,
        })),
      };

      const synthesisPrompt = `${this.systemPrompt}\n\nRAW RESEARCH DATA:\n${JSON.stringify(rawData, null, 2)}\n\nSYNTHESIZED OUTPUT (JSON only):`;

      const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
        prompt: synthesisPrompt,
        max_tokens: 2500,
        temperature: 0.2,
      });

      const text = (aiResponse as { response?: string }).response || "";

      // Parse JSON output
      let data: unknown;
      try {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : text;
        data = JSON.parse(jsonStr);
      } catch {
        data = { 
          raw_response: text,
          parse_error: "Could not parse AI response as JSON" 
        };
      }

      const sources = [
        websiteUrl,
        ...(news.articles?.map(a => a.url) || []),
      ].filter(Boolean);

      return {
        agent: this.name,
        status: "success",
        data,
        reasoning: `Searched web for ${companyName}, scraped ${websiteUrl}, fetched ${news.articles?.length || 0} news articles. Synthesized with Workers AI.`,
        sources,
        confidence: scraped.error ? 0.6 : 0.85,
      };

    } catch (error) {
      console.error("ResearchAgent failed:", error);
      
      return {
        agent: this.name,
        status: "failure",
        data: null,
        reasoning: `Research failed after ${Date.now() - startTime}ms: ${error instanceof Error ? error.message : "Unknown error"}`,
        sources: [],
        confidence: 0,
      };
    }
  }

  /**
   * Extract company name from user message
   * Simple approach: take everything after "research" or use the whole message
   */
  private extractCompanyName(message: string): string {
    const lower = message.toLowerCase();
    
    // Common patterns: "Research Stripe", "Tell me about Stripe", "What does Stripe do"
    const patterns = [
      /research\s+(.+)/i,
      /tell me about\s+(.+)/i,
      /what does\s+(.+)\s+do/i,
      /look up\s+(.+)/i,
      /find info on\s+(.+)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Fallback: just use the message (minus common words)
    return message.replace(/^(research|about|find)\s+/i, "").trim();
  }
}
