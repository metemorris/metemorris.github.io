import type { CollectionEntry } from "astro:content";

export type PostStatus = "published" | "draft" | "private";

export const getPostStatus = (
  post: Pick<CollectionEntry<"posts">, "data">
): PostStatus => {
  if (post.data.status) {
    return post.data.status;
  }

  return post.data.draft ? "draft" : "published";
};

export const isPublishedPost = (
  post: Pick<CollectionEntry<"posts">, "data">
) => getPostStatus(post) === "published";

export const isVisiblePost = (
  post: Pick<CollectionEntry<"posts">, "data">
) => getPostStatus(post) !== "draft";
