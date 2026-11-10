// /llms.txt (llmstxt.org): what the site is and where each page's Markdown lives.
import type { APIRoute } from "astro";
import { llmsTxt } from "../lib/markdown";

export const GET: APIRoute = async () =>
	new Response(await llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
