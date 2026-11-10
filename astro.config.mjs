// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [
			{
				// The home's Markdown is built as /index.md and served at /.md: on Vercel by vercel.json, and in
				// `astro dev` by this rewrite, so the local site uses the same URL as the deployed one.
				name: 'home-markdown',
				configureServer(server) {
					server.middlewares.use((req, _res, next) => {
						const r = /** @type {{ url?: string }} */ (req); // no Node types installed
						if (r.url === '/.md') r.url = '/index.md';
						next();
					});
				},
			},
		],
	},
});
