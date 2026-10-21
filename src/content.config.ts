import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const projects = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
	schema: z.object({
		title: z.string(),
		category: z.string(),
		excerpt: z.string(),
		order: z.number(),
		media: z.object({
			kind: z.enum(["image", "video"]).default("image"),
			ratio: z.string().default("8 / 5"),
		}),
	}),
});

export const collections = { projects };
