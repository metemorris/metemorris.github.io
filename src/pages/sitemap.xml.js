import { getCollection } from 'astro:content';

export async function GET({ site }) {
  const baseUrl = site ?? new URL('https://www.metemorris.com');
  const basePages = ['/', '/blog/', '/rss.xml'];

  const posts = await getCollection('posts');
  const publishedPosts = posts.filter((post) => !post.data.draft);

  const entries = [
    ...basePages.map((path) => ({
      loc: new URL(path, baseUrl).href,
      lastmod: undefined,
    })),
    ...publishedPosts.map((post) => ({
      loc: new URL(`/posts/${post.slug}/`, baseUrl).href,
      lastmod: post.data.date.toISOString(),
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (entry) => `  <url>
    <loc>${entry.loc}</loc>${entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ''}
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}
