# Alexandra Lerner – Portfolio

> **TODO:** `proyecto-01` is a provisional name. When the project has its real name, change its `title` in
> `src/content/projects/proyecto-01.md` and rename the file: the file name sets the URLs
> `/proyectos/proyecto-01` and `/proyectos/proyecto-01.md`.

## Content

- Home page texts: `src/content/site.ts`.
- Projects: one Markdown file per project in `src/content/projects/`.

## Versions for AI agents

Every page also exists as Markdown, generated at build time from the same content as the HTML
(`src/lib/markdown.ts`), so it never needs to be edited by hand:

- `/.md`: the home page (built as `/index.md`; `vercel.json` serves it at `/.md`).
- `/proyectos/<slug>.md`: each project.
- `/llms.txt`: site summary and links to each page's Markdown ([llmstxt.org](https://llmstxt.org)).
- A request to a page with `Accept: text/markdown` gets its Markdown at the same URL (`vercel.json`);
  browsers and `*/*` still get HTML.
- Each HTML page links its Markdown with `<link rel="alternate" type="text/markdown">`.

Check after a deploy:

```sh
curl -s https://www.alexandra.sh/.md
curl -s https://www.alexandra.sh/llms.txt
curl -sI -H "Accept: text/markdown" https://www.alexandra.sh/proyectos/proyecto-01
```

---

# Astro Starter Kit: Basics

```sh
npm create astro@latest -- --template basics
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── assets
│   │   └── astro.svg
│   ├── components
│   │   └── Welcome.astro
│   ├── layouts
│   │   └── Layout.astro
│   └── pages
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
