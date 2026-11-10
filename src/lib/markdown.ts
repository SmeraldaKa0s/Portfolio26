// Markdown versions of the pages, for AI agents (llmstxt.org, "Markdown for Agents"). Built from the same
// data as the HTML: src/content/site.ts for the home, the projects collection for each project.
// vercel.json serves them at the page's URL + .md, and at the page's own URL when a request asks for
// text/markdown in its Accept header.
import { getCollection, type CollectionEntry } from "astro:content";
import { about, contact, cta, experience, field, hero, site, VISIBLE_PROJECTS } from "../content/site";

type Project = CollectionEntry<"projects">;

// where each page's Markdown lives (the home's is /.md; vercel.json maps it to the built /index.md)
export const homeMarkdownPath = "/.md";
export const projectPath = (project: Project) => `/proyectos/${project.id}`;
export const projectMarkdownPath = (project: Project) => `${projectPath(project)}.md`;
const abs = (path: string) => site.url + path;

const heroSentence = () => hero.lines.map((words) => words.join(" ")).join(" ");
const unwrap = (label: string) => label.replace(/^\(\s*|\s*\)$/g, "");
// GitHub still points at the placeholder profile: leave it out until it is real
const hasGithub = () => contact.github.replace(/\/$/, "") !== "https://github.com";

export async function visibleProjects() {
	return (await getCollection("projects")).sort((a, b) => a.data.order - b.data.order).slice(0, VISIBLE_PROJECTS);
}

export async function homeMarkdown() {
	const projects = await visibleProjects();
	const out = [
		`# ${site.name} – ${site.role}`,
		"",
		`> ${heroSentence()}`,
		"",
		hero.labels.map(unwrap).join(" · "),
		"",
		"## Work",
		"",
		...projects.flatMap((p) => [
			`### [${p.data.title}](${abs(projectMarkdownPath(p))})`,
			"",
			`${p.data.category}. ${p.data.excerpt}`,
			"",
		]),
		`## ${about.title}`,
		"",
		`**${about.statement}**`,
		"",
		...about.paragraphs.flatMap((text) => [text, ""]),
		`### ${about.capabilitiesTitle}`,
		"",
		...about.capabilities.map((item) => `- ${item}`),
		"",
		`## ${experience.title}`,
		"",
		...experience.roles.flatMap((role) => [`### ${role.title} (${role.dates})`, "", role.text, ""]),
		`## ${field.title}`,
		"",
		...field.works.flatMap((work) => [
			`### ${work.title.join(" ")}`,
			"",
			`${work.type} · ${work.client} · ${work.duration} · ${work.year}`,
			"",
			`Roles: ${work.roles.join(", ")}`,
			"",
		]),
		"## Contacto",
		"",
		cta.heading,
		"",
		cta.copy,
		"",
		`- Agendar una llamada: ${contact.booking}`,
		`- Email: ${contact.email}`,
		`- LinkedIn: ${contact.linkedin}`,
		...(hasGithub() ? [`- GitHub: ${contact.github}`] : []),
	];
	return out.join("\n") + "\n";
}

export function projectMarkdown(project: Project) {
	const { title, category, excerpt } = project.data;
	const out = [
		`# ${title}`,
		"",
		`${category}. Proyecto de ${site.name}, ${site.role}.`,
		"",
		`> ${excerpt}`,
		"",
		(project.body ?? "").trim(),
		"",
		"---",
		"",
		`- Portfolio: ${abs(homeMarkdownPath)}`,
		`- Contacto: ${contact.email}`,
	];
	return out.join("\n") + "\n";
}

export async function llmsTxt() {
	const projects = await visibleProjects();
	const out = [
		`# ${site.name}`,
		"",
		`> ${heroSentence()} Este sitio es su portfolio: proyectos, experiencia y contacto.`,
		"",
		"Cada página tiene su versión en Markdown en la misma URL terminada en .md, o en la misma URL pidiendo `Accept: text/markdown`.",
		"",
		"## Páginas",
		"",
		`- [Home](${abs(homeMarkdownPath)}): quién es Alexandra, proyectos destacados, experiencia, investigación de campo y contacto.`,
		"",
		"## Proyectos",
		"",
		...projects.map((p) => `- [${p.data.title}](${abs(projectMarkdownPath(p))}): ${p.data.category}. ${p.data.excerpt}`),
	];
	return out.join("\n") + "\n";
}

export const markdownResponse = (body: string) =>
	new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
