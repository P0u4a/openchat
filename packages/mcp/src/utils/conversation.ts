import {
  formatConversationMarkdown as formatConversationMarkdownCore,
  sortConversations,
  type Conversation,
} from "@p0u4a/openchat-core";

export { sortConversations };

export function slugify(title: string): string {
  const normalized = title
    .toLowerCase()
    .trim()
    .replaceAll(/['"]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return normalized || "untitled";
}

export function stableConversationSuffix(conversation: Conversation): string {
  const suffix = slugify(
    conversation.source.conversationId || conversation.id
  ).replace(/^untitled$/, "conversation");

  return suffix;
}

export function formatConversationMarkdown(conversation: Conversation): string {
  return formatConversationMarkdownCore(conversation, { mode: "rich" });
}
