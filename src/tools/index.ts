import { Tool } from "../types";
import { WebSearchTool } from "./web-search";
import { WebScraperTool } from "./web-scraper";
import { NewsAPITool } from "./news-api";

/**
 * Tool Registry
 * 
 * Central registry of all available tools.
 * Agents import from here to get their toolset.
 */

export const AllTools: Tool[] = [
  WebSearchTool,
  WebScraperTool,
  NewsAPITool,
];

export { WebSearchTool, WebScraperTool, NewsAPITool };
