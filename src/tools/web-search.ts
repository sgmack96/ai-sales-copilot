import { Tool } from "../types";
import { z } from "zod";

/**
 * Web Search Tool
 * 
 * Uses DuckDuckGo HTML search (no API key required).
 * This is a pragmatic choice for a portfolio project.
 * 
 * In production, you'd use:
 * - Serper.dev (Google Search API)
 * - Brave Search API
 * - Bing Search API
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
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      
      console.log(`[WebSearch] Searching: ${searchUrl}`);
      
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      console.log(`[WebSearch] Got ${html.length} bytes of HTML`);
      
      const results = parseDuckDuckGoResults(html, Math.min(numResults, 10));
      console.log(`[WebSearch] Parsed ${results.length} results`);

      if (results.length === 0) {
        console.log(`[WebSearch] No results found. HTML preview: ${html.slice(0, 500)}`);
      }

      return {
        query,
        results,
        count: results.length,
      };
    } catch (error) {
      console.error(`[WebSearch] Error:`, error);
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
 * Handles multiple DuckDuckGo HTML formats
 */
function parseDuckDuckGoResults(html: string, maxResults: number): Array<{
  title: string;
  url: string;
  snippet: string;
}> {
  const results = [];
  
  // Try multiple regex patterns for different DDG HTML formats
  
  // Pattern 1: Classic result format
  const classicRegex = /<div class="result[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g;
  let matches = html.match(classicRegex) || [];
  
  // Pattern 2: Alternative result wrapper
  if (matches.length === 0) {
    const altRegex = /<div class="web-result[^"]*"[^>]*>[\s\S]*?<\/div>/g;
    matches = html.match(altRegex) || [];
  }
  
  console.log(`[WebSearch] Found ${matches.length} result blocks`);

  for (const match of matches.slice(0, maxResults)) {
    // Try multiple title patterns
    let titleMatch = match.match(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/);
    if (!titleMatch) {
      titleMatch = match.match(/<a[^>]*class="result__title"[^>]*>(.*?)<\/a>/);
    }
    if (!titleMatch) {
      // Try any link in result
      titleMatch = match.match(/<a[^>]*href="[^"]*"[^>]*>(.*?)<\/a>/);
    }
    
    // Try multiple URL patterns
    let urlMatch = match.match(/<a[^>]*href="(\/l\/\?[^"]*)"/);
    if (!urlMatch) {
      urlMatch = match.match(/<a[^>]*href="(https?:\/\/[^"]*)"/);
    }
    
    // Try multiple snippet patterns
    let snippetMatch = match.match(/<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/);
    if (!snippetMatch) {
      snippetMatch = match.match(/class="result__snippet"[^>]*>(.*?)<\/div>/);
    }

    if (titleMatch && urlMatch) {
      let url = urlMatch[1];
      
      // Decode DuckDuckGo redirect URLs
      if (url.startsWith("/l/?")) {
        const uddgMatch = url.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          url = decodeURIComponent(uddgMatch[1]);
        }
      }
      
      results.push({
        title: stripHtml(titleMatch[1]),
        url,
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
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
