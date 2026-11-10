// Each project page as Markdown: /proyectos/<slug>.md
import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { markdownResponse, projectMarkdown } from "../../lib/markdown";

export const getStaticPaths = (async () => {
	const projects = await getCollection("projects");
	return projects.map((project) => ({ params: { slug: project.id }, props: { project } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => markdownResponse(projectMarkdown(props.project as CollectionEntry<"projects">));
