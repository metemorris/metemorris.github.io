import { defineConfig } from 'astro/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

const site = 'https://www.metemorris.com';
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const postsRoot = path.join(projectRoot, 'src', 'content', 'posts');

const normalizeUrl = (url) => (url.endsWith('/') ? url : `${url}/`);

const getFrontmatter = (raw) => {
  if (!raw.startsWith('---')) {
    return {};
  }

  const lines = raw.split(/\r?\n/);
  const endIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
  if (endIndex === -1) {
    return {};
  }

  const frontmatterLines = lines.slice(1, endIndex + 1);
  const frontmatter = {};

  for (const line of frontmatterLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    frontmatter[key] = value;
  }

  return frontmatter;
};

const collectPostFiles = (dir) => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectPostFiles(fullPath));
    } else if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
};

const getHiddenPostSlugs = () => {
  const files = collectPostFiles(postsRoot);
  const hiddenSlugs = [];

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const data = getFrontmatter(raw);
    const status = data.status?.toLowerCase();
    const draft = data.draft?.toLowerCase() === 'true';

    if (status === 'private' || status === 'draft' || (!status && draft)) {
      const relative = path.relative(postsRoot, file);
      const slug = relative.replace(/\.(md|mdx)$/, '').split(path.sep).join('/');
      hiddenSlugs.push(slug);
    }
  }

  return hiddenSlugs;
};

const hiddenPostUrls = new Set(
  getHiddenPostSlugs().map((slug) => normalizeUrl(`${site}/posts/${slug}`))
);

export default defineConfig({
  site,
  integrations: [
    tailwind(),
    mdx(),
    sitemap({
      filter: (page) => !hiddenPostUrls.has(normalizeUrl(page)),
    }),
  ],
});
