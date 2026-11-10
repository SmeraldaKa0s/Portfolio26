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
	statement: "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor.",
	paragraphs: [
		"Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore.",
		"Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat, duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.",
		"Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem.",
		"Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.",
	],
	capabilitiesTitle: "Capacidades",
	capabilities: [
		"Product Design",
		"Web Design",
		"Prototipado con IA",
		"Estrategia de producto",
		"Design Systems",
		"Proyectos 0→1",
		"Investigación de usuarios",
	],
};

export const experience = {
	title: "Experiencia",
	roles: [
		{ title: "Empresa actual", text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod tempor incididunt.", dates: "Actual" },
		{ title: "Empresa anterior 1", text: "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip.", dates: "2025-26" },
		{ title: "Empresa anterior 2", text: "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.", dates: "2021-2022" },
		{ title: "Empresa anterior 3", text: "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim.", dates: "2020-2021" },
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
