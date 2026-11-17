// The home page's texts, in one place. The components render them as HTML and src/lib/markdown.ts
// turns the same data into the Markdown versions (/.md, /llms.txt), so the two never drift apart.

export const site = {
	url: "https://www.alexandra.sh",
	name: "Alexandra Lerner",
	role: "Product Designer",
	description: "Portfolio de Alexandra Lerner, Product Designer.",
};

export const contact = {
	email: "alek.xandra.lerner@gmail.com",
	linkedin: "https://www.linkedin.com/in/alx-l/",
	// "Hablemos": books a 30-minute call
	booking: "https://cal.com/alexandra-lerner-gijrbm/product-sesion-30",
	// TODO: replace with the real GitHub profile URL
	github: "https://github.com/",
};

export const hero = {
	// one entry per line of the headline; the first word is highlighted
	lines: [
		["Alexandra", "is", "a", "product", "designer"],
		["and", "AI", "builder"],
		["for", "startups", "&", "product", "teams,"],
		["backed", "by", "5+", "years", "of", "experience."],
	],
	// the word the butterfly lands on
	perch: "designer",
	labels: ["( Based in Argentina )", "( Est. 2021 )"],
};

export const about = {
	title: "Info",
	statement: "Turning how a business really operates into products people actually use.",
	paragraphs: [
		"I’m a Product Designer and AI Builder, crafting digital products for startups and product teams.",
		"Over the past 5 years, I’ve helped companies in logistics, fintech and retail make sense of complex operations: the workarounds, spreadsheets and daily friction that never show up in a brief. I find what’s really slowing teams down and turn it into tools they actually adopt.",
		"I work best close to founders and product leads, where decisions are made and shipped fast. With AI built into my process, I can go from a conversation with a client to a working product in production, without losing the details that make people trust it.",
		"Good taste without accountability is just decoration. Good taste with accountability is leadership.",
		"Soon I’ll also be a registered Industrial Property Agent, so the products and brands I help build can be protected too.",
	],
	capabilitiesTitle: "Capacidades",
	capabilities: [
		"Design to Code",
		"AI Prototyping",
		"Field Research",
		"Operational & Data-rich UI",
		"Design Systems",
		"0 → 1 Products",
		"Product Strategy",
	],
};

export const experience = {
	title: "Experiencia",
	roles: [
		{
			title: "Product Designer & AI Builder @ Side project",
			text: "Designing and building a platform that brings scattered information from Argentine universities into one place, helping people compare degrees and see where each path leads.",
			dates: "Current",
		},
		{
			title: "Product Designer @ Pickit",
			text: "Designing data-rich admins, rider apps and AI-powered interfaces for a last-mile logistics company across 4 Latin American markets, from field research to production.",
			dates: "Current",
		},
		{
			title: "UX/UI Designer @ PhinxLab",
			text: "Built token-based design systems and a Storybook library for multiple clients at a digital consultancy, designing apps and websites for fintech and healthcare, as well as an online multiplayer card game.",
			dates: "2024–25",
		},
		{
			title: "UX Engineer & Frontend Developer @ ATAWAY",
			text: "Bridged design and code at a software consultancy, taking client products from research and design to frontend development, QA and documentation, including an e-learning platform for Cencosud.",
			dates: "2022–23",
		},
		{
			title: "UX Researcher @ UNTREF",
			text: "Conducted field and market research for technology innovation projects and contributed to patent applications.",
			dates: "2021–23",
		},
	],
};

// "Experiencia en campo". `title` is a list of lines, keep each line short. `image` is optional (a path
// under /public or a URL); when it is empty the slide is a plain grey placeholder.
export const field = {
	title: "Experiencia en campo",
	works: [
		{
			type: "Investigación de campo",
			client: "Lorem Ipsum Co.",
			title: ["Campo", "abierto"],
			duration: "6 semanas",
			year: "2026",
			roles: ["Entrevistas", "Observación", "Síntesis"],
			image: "",
		},
		{
			type: "Estudio etnográfico",
			client: "Dolor Sit Labs",
			title: ["Marea", "baja"],
			duration: "3 meses",
			year: "2025",
			roles: ["Shadowing", "Diarios", "Mapeo"],
			image: "",
		},
		{
			type: "Test de usabilidad",
			client: "Amet Studio",
			title: ["Curvas de", "nivel"],
			duration: "2 semanas",
			year: "2024",
			roles: ["Moderación", "Prototipos", "Reporte"],
			image: "",
		},
		{
			type: "Co-creación",
			client: "Consectetur SA",
			title: ["Fuego", "lento"],
			duration: "4 semanas",
			year: "2023",
			roles: ["Workshops", "Facilitación"],
			image: "",
		},
		{
			type: "Auditoría de servicio",
			client: "Adipiscing Group",
			title: ["Grafito"],
			duration: "5 semanas",
			year: "2022",
			roles: ["Blueprint", "Entrevistas", "Roadmap"],
			image: "",
		},
	],
};

export const cta = {
	heading: "¿Necesitás un partner de diseño?",
	copy: "Agendá una llamada conmigo para explorar tus objetivos y ver si somos buen equipo para colaborar.",
	button: "Decime hola",
};

// temporary: only the first projects are shown, to keep the page short while working on it.
// The camera journey in scripts/workOrbit.ts is tuned for 3: more projects need its orbit retuned.
export const VISIBLE_PROJECTS = 3;
