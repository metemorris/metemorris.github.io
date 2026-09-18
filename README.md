# Mete Morris — Personal Site

## Project Structure

```text
/ (project root)
├── public/               # Static assets (favicon, avatar, icons)
├── src/
│   ├── components/       # Reusable components
│   ├── content/          # Astro content collections (MDX posts)
│   ├── data/             # Data files (resume, etc)
│   ├── layouts/          # Base layout used across pages
│   ├── pages/            # Astro routes (/, /blog, /posts/[slug])
│   └── styles/           # Tailwind + global.css
├── astro.config.mjs
├── tailwind.config.cjs
├── tsconfig.json
└── package.json
```

Astro maps files in `src/pages/` to routes automatically. Content lives in `src/content/` (managed by Astro collections),
while static assets go in `public/`.

## Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/` (also builds the Pagefind search index) |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## Post visibility (published/draft/private)

Posts support three states via frontmatter:

```yaml
status: published | draft | private
```

- `published`: appears everywhere (blog index, tags, RSS, OG).
- `draft`: not built and not accessible by URL.
- `private`: built and shareable by direct URL, but excluded from blog index, tags, RSS, and marked `noindex`.

Notes:
- `draft: true` is still supported for backwards compatibility (treated the same as `status: draft`).
- If both `status` and `draft` are set, `status` takes precedence.

## ✅ Next steps / TODO

### 1. 🚨 Core Fixes & Architecture (High Priority)
- [x] **Mobile Layout**: Enhance distinction between résumé and blog sections; fix header spacing.
- [x] **Refactor Data**: Move hardcoded "Experience" and "Education" data from `index.astro` to `src/data/` or a Content Collection only for better maintainability.
- [x] **Standardize UI**: Create reusable `<Section>` and `<SectionHeader>` components to ensure consistent spacing and typography.

### 2. 🔍 SEO & Automation
- [x] **Sitemap**: Switch from manual `src/pages/sitemap.xml.js` to `@astrojs/sitemap` integration for automated generation.
- [x] **Robots.txt**: Create `public/robots.txt` and ensure it points to the sitemap.
- [x] **Manifest**: Add `webmanifest` for better mobile installability.

### 3. 📝 Blog Features (Engagement)
- [x] **Search**: Implement **Pagefind** for static search.
- [x] **Tags**: Add tag filtering and dynamic `/tags/[tag]` pages.
- [x] **Reading Time**: Add estimated reading time to post metadata.
- [x] **Open Graph**: Automate OG image generation for every post.

### 4. 🌍 Localization (Expansion)
- [ ] **TR Support**: Create `/tr` route branch.
- [ ] **I18n**: Implement basic dictionary for UI strings (e.g., "Latest Post" -> "Son Yazılar").

### 5. 🛠 Maintenance & Polish
- [ ] **Linting**: detailed Prettier + ESLint setup.
- [x] **Analytics**: Add privacy-friendly analytics (GoatCounter, see below).

### 6. ✅ Completed / Verified
- [x] Dark/light mode preference memory (Implemented in `Base.astro`).
- [x] Basic Metadata (HTML Title/Description).
- [x] Add JSON-LD structured data.

## Notes

- **Search (Pagefind):** the search index is generated during `npm run build` and served from `dist/pagefind/`. Run a build at least once before `npm run dev`, or the search bar will render a disabled fallback.
- **Analytics (GoatCounter):** the snippet lives in `src/layouts/Base.astro` and only loads in production builds (`import.meta.env.PROD`), so local dev never pollutes stats. Dashboard: `metemorris.goatcounter.com`. No cookies, nothing visible on the site.
- **Avatar:** the live portrait/OG image is `public/avatar.jpg` (`/avatar.jpg`). The old `public/headshot.jpg` was removed.
