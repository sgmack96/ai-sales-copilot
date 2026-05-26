import { Tool } from "../types";
import { z } from "zod";

/**
 * Web Search Tool
 * 
 * Uses DuckDuckGo HTML search (no API key required).
 * This is a pragmatic choice for a portfolio project — no signup, no billing.
 * 
 * In production, you'd use:
 * - Serper.dev (Google Search API)
 * - Brave Search API
 * - Bing Search API
 * - Exa.ai (neural search)
 */

export const WebSearchTool: Tool = {
  name: "web_search",
  description: "Search the web for information about a company, technology, or topic. Returns top results with titles, URLs, and snippets.",
  parameters: z.object({
    query: z.string().min(1).describe("The search query"),
    numResults: z.number().optional().default(5).describe("Number of results to return (max 10)"),
  }),

  async execute(params: unknown) {
    const { query, numResults } = params as { query: string; numResults: number };

    try {
      // DuckDuckGo HTML search
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const html = await response.text();
      const results = parseDuckDuckGoResults(html, Math.min(numResults, 10));

      return {
        query,
        results,
        count: results.length,
      };
    } catch (error) {
      return {
        query,
        error: error instanceof Error ? error.message : "Search failed",
        results: [],
      };
    }
  },
};

/**
 * Parse DuckDuckGo HTML results
 * DuckDuckGo HTML version uses specific class names
 */
function parseDuckDuckGoResults(html: string, maxResults: number): Array<{
  title: string;
  url: string;
  snippet: string;
}> {
  const results = [];
  
  // DuckDuckGo HTML results are in .result elements
  const resultRegex = /<div class="result[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g;
  const matches = html.match(resultRegex) || [];

  for (const match of matches.slice(0, maxResults)) {
    const titleMatch = match.match(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/);
    const urlMatch = match.match(/<a[^>]*href="(.*?)"/);
    const snippetMatch = match.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/);

    if (titleMatch && urlMatch) {
      results.push({
        title: stripHtml(titleMatch[1]),
        url: decodeURIComponent(urlMatch[1].replace(/^\/l\?kh=-?\d+&uddg=/, "")).replace(/^\/l\?.*uddg=/, ""),
        snippet: snippetMatch ? stripHtml(snippetMatch[1]) : "",
      });
    }
  }

  return results;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
