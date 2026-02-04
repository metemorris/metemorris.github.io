import { OGImageRoute } from 'astro-og-canvas';
import { getCollection } from 'astro:content';
import { isVisiblePost } from '../../utils/postVisibility';

const posts = await getCollection('posts');
const pages = Object.fromEntries(
  posts
    .filter((post) => isVisiblePost(post))
    .map((post) => [
      post.slug,
      { title: post.data.title, description: post.data.description },
    ])
);

export const { getStaticPaths, GET } = OGImageRoute({
    param: 'slug',
    pages: pages,
    getImageOptions: (path, page) => ({
        title: page.title,
        description: page.description,
        bgGradient: [[24, 24, 27]], // Dark gray
        border: { color: [63, 63, 70], width: 20 }, // Border
        padding: 60,
        font: {
            title: {
                size: 72,
                weight: 'Bold',
                color: [255, 255, 255],
            },
            description: {
                size: 32,
                lineHeight: 1.4,
                color: [161, 161, 170],
            },
        },
    }),
});
