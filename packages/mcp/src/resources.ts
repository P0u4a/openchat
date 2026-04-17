import type { Conversation, Platform } from "@p0u4a/openchat-core";
import type { ResourceEntry } from "./schema";
import {
  stableConversationSuffix,
  slugify,
  sortConversations,
} from "./utils/conversation";

export function buildResourceMetadata(entry: ResourceEntry) {
  return {
    name: entry.title,
    title: entry.title,
    description: `Conversation from ${entry.provider}`,
    mimeType: "text/markdown",
    annotations: {
      audience: ["assistant" as const],
      lastModified: entry.conversation.updatedAt,
    },
    _meta: {
      provider: entry.provider,
      createdAt: entry.conversation.createdAt,
      conversationId: entry.conversation.source.conversationId,
      sourceUrl: entry.conversation.source.url,
    },
  };
}

export function buildResourceIndex(conversations: Conversation[]): {
  entries: ResourceEntry[];
  byProvider: Map<Platform, ResourceEntry[]>;
  byUri: Map<string, ResourceEntry>;
} {
  const baseSlugCounts = new Map<string, number>();
  for (const conversation of conversations) {
    const key = `${conversation.source.platform}:${slugify(
      conversation.title
    )}`;
    baseSlugCounts.set(key, (baseSlugCounts.get(key) ?? 0) + 1);
  }

  const entries = sortConversations(conversations).map((conversation) => {
    const provider = conversation.source.platform;
    const baseSlug = slugify(conversation.title);
    const counterKey = `${provider}:${baseSlug}`;
    const slug =
      baseSlugCounts.get(counterKey) === 1
        ? baseSlug
        : `${baseSlug}-${stableConversationSuffix(conversation)}`;
    const uri = `chat://${provider}/${slug}`;

    return {
      conversation,
      provider,
      slug,
      title: conversation.title || "Untitled",
      uri,
    };
  });

  const byProvider = new Map<Platform, ResourceEntry[]>();
  const byUri = new Map<string, ResourceEntry>();

  for (const entry of entries) {
    byUri.set(entry.uri, entry);

    const providerEntries = byProvider.get(entry.provider) ?? [];
    providerEntries.push(entry);
    byProvider.set(entry.provider, providerEntries);
  }

  return { entries, byProvider, byUri };
}
