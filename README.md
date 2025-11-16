# Mete Morris — Personal Site

## 🚀 Project Structure

```text
/ (project root)
├── public/               # Static assets (favicon, headshot, icons)
├── src/
│   ├── content/          # Astro content collections (MDX posts)
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

## ✅ Next steps / TODO

### UI & UX Improvements
- [ ] Improve mobile layout to better distinguish **résumé** vs **blog** sections
- [ ] Add clearer section headers on mobile
- [ ] Add spacing & visual separators between major sections
- [ ] Refine navbar spacing/contrast for smaller screens

### Blog Features
- [ ] Add **reading time** + better **published date** formatting for blog posts
- [ ] Add **tag filtering** on the blog index page
- [ ] Add **search functionality** (Pagefind or custom client-side JS)
- [ ] Create dynamic `/tags/[tag]` pages
- [ ] Add **OG image generation** for each post (social preview cards)
- [ ] Add **JSON Feed** (`feed.json`) alongside RSS
- [ ] Add **related posts** section below each article (optional)

### Interaction & Engagement
- [ ] Add anonymous **like / heart** button to blog posts
- [ ] Add **comment system** (Giscus, Utterances, or Staticman)
- [ ] Add “Share on X / Reddit / LinkedIn” buttons on posts

### Localization
- [ ] Add a **Turkish language toggle** (EN / TR switch)
- [ ] Create localized `/tr` versions of key pages
- [ ] Localize UI strings + metadata

### SEO Enhancements
- [ ] Add **JSON-LD structured data** (Article schema for blog posts)
- [ ] Add **og:image** and **twitter:image** meta tags
- [ ] Improve canonical URL handling
- [ ] Add or update `robots.txt`
- [ ] Ensure the sitemap is linked and correct
- [ ] Add descriptive **alt text** to all images
- [ ] Perform an accessibility pass (colors, contrast, heading order)

### Developer Tooling & Code Quality
- [ ] Have ChatGPT crawl the entire site and report missing meta tags, broken links, missing alt text
- [ ] Refactor layout/components for clarity and consistency
- [ ] Add type-safe frontmatter schemas for more content types
- [ ] Add **Prettier** + **ESLint** setup
- [ ] Add **Lighthouse CI** checks (optional)

### Subdomains
- [ ] Configure `blog.metemorris.com`
- [ ] Add DNS CNAME: `blog → metemorris.github.io`
- [ ] Add redirect page: `src/pages/blog/index.astro` → redirects to `/blog`

### Analytics & Monitoring
- [ ] Add privacy-friendly analytics (Plausible / Umami / Cloudflare Analytics)
- [ ] Add outbound link click tracking (optional)

### Extra Pages (Optional)
- [ ] `/reading` — books and articles

### Future Nice-to-Haves
- [ ] Add dark/light mode **preference memory** (localStorage)
- [ ] Add keyboard navigation shortcuts (J/K to move between posts)
- [ ] Add an **AI-assisted search** or “Ask Mete’s AI” widget
- [ ] Generate weekly automated digest (“This week on the blog…”)

