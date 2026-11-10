// The home page as Markdown. Built as /index.md; vercel.json serves it at /.md.
import type { APIRoute } from "astro";
import { homeMarkdown, markdownResponse } from "../lib/markdown";

export const GET: APIRoute = async () => markdownResponse(await homeMarkdown());
