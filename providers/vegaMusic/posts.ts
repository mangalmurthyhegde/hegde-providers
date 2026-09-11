import { Post, ProviderContext } from "../types";

export const getPosts = async function ({
  filter,
  page,
  providerValue,
  signal,
  providerContext,
}: {
  filter: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  // Home page will be added later.
  return [];
};

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  nextPageToken?: string;
}

export const getSearchPosts = async function ({
  searchQuery,
  page,
  providerValue,
  signal,
  providerContext,
}: {
  searchQuery: string;
  page: number;
  providerValue: string;
  signal: AbortSignal;
  providerContext: ProviderContext;
}): Promise<Post[]> {
  const { axios, kvStore } = providerContext;

  if (!searchQuery?.trim()) {
    return [];
  }

  const apiKey = await kvStore.get<string>("youtubeApiKey");
  if (!apiKey) {
    throw new Error("YouTube API key is not configured.");
  }

  // YouTube paginates via pageToken, not page number, so we cache the
  // token needed to reach each page, keyed by query + page.
  const pageTokenKey = `youtubeSearchPageToken:${searchQuery}:${page}`;
  const pageToken =
    page > 1 ? await kvStore.get<string>(pageTokenKey) : undefined;

  if (page > 1 && !pageToken) {
    // We don't have a token for this page (e.g. pages were skipped or
    // cache expired) — can't jump directly to it.
    return [];
  }

  let response;
  try {
    response = await axios.get<YouTubeSearchResponse>(
      "https://www.googleapis.com/youtube/v3/search",
      {
        params: {
          part: "snippet",
          q: searchQuery,
          type: "video",
          videoCategoryId: "10",
          maxResults: 20,
          pageToken,
          key: apiKey,
        },
        signal,
      },
    );
  } catch (error: any) {
    if (axios.isCancel?.(error) || error?.name === "CanceledError") {
      throw error; // let caller handle aborts, don't mask them
    }
    const message =
      error?.response?.data?.error?.message ?? error?.message ?? "Unknown error";
    throw new Error(`YouTube search failed: ${message}`);
  }

  const { items = [], nextPageToken } = response.data ?? {};

  if (nextPageToken) {
    await kvStore.set(`youtubeSearchPageToken:${searchQuery}:${page + 1}`, nextPageToken);
  }

  return items
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      title: item.snippet?.title ?? "Unknown",
      link: `https://www.youtube.com/watch?v=${item.id!.videoId}`,
      image:
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        "",
    }));
};