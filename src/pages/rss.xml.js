import { getCollection } from 'astro:content';

const asCdata = (value) => `<![CDATA[${value.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;

export async function GET(context) {
  const site = context.site ?? 'https://www.metemorris.com';
  const siteUrl = new URL(site);
  const posts = await getCollection('posts');
  const publishedPosts = posts
    .filter((post) => !post.data.draft)
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  const items = publishedPosts
    .map((post) => {
      const postUrl = new URL(`/posts/${post.slug}/`, siteUrl).href;
      return `    <item>
      <title>${asCdata(post.data.title)}</title>
      <link>${postUrl}</link>
      <guid>${postUrl}</guid>
      <description>${asCdata(post.data.description)}</description>
      <pubDate>${post.data.date.toUTCString()}</pubDate>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${asCdata('Mete Morris Blog')}</title>
    <link>${siteUrl.href}</link>
    <description>${asCdata('Latest posts from Mete Morris')}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}
