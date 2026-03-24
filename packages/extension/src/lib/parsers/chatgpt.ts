import { toIsoTimestamp } from "../../utils/format.js";
import type {
  OpenChatConversation,
  OpenChatContentBlock,
  OpenChatMessage,
} from "../schema/conversation.js";

interface ChatGPTMessageAuthor {
  role?: string;
}

interface ChatGPTMessageContent {
  content_type?: string;
  parts?: unknown[];
  text?: string;
  language?: string;
}

interface ChatGPTConversationMessage {
  id: string;
  author?: ChatGPTMessageAuthor;
  create_time?: number | string | null;
  update_time?: number | string | null;
  content?: ChatGPTMessageContent;
  metadata?: Record<string, unknown>;
  recipient?: string | null;
  channel?: string | null;
}

interface ChatGPTConversationNode {
  id: string;
  message?: ChatGPTConversationMessage | null;
  parent?: string | null;
}

export interface ChatGPTConversationResponse {
  title?: string;
  create_time?: number | string | null;
  update_time?: number | string | null;
  current_node?: string | null;
  conversation_id?: string;
  default_model_slug?: string | null;
  mapping: Record<string, ChatGPTConversationNode>;
}

function getLineageIds(data: ChatGPTConversationResponse): string[] {
  const lineage: string[] = [];
  let nodeId = data.current_node ?? null;
  const seen = new Set<string>();

  while (nodeId && !seen.has(nodeId)) {
    const node = data.mapping[nodeId];
    if (!node) break;
    lineage.push(nodeId);
    seen.add(nodeId);
    nodeId = node.parent ?? null;
  }

  if (lineage.length > 0) {
    return lineage.reverse();
  }

  return Object.values(data.mapping)
    .filter((node): node is ChatGPTConversationNode => Boolean(node?.message))
    .sort((a, b) => {
      const aTime = a.message?.create_time ?? 0;
      const bTime = b.message?.create_time ?? 0;
      return Number(aTime) - Number(bTime);
    })
    .map((node) => node.id);
}

function extractTextParts(content: ChatGPTMessageContent): string[] {
  const parts = Array.isArray(content.parts)
    ? content.parts.flatMap((part) => {
        if (typeof part === "string") return [part];
        if (
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return [part.text];
        }
        return [];
      })
    : [];

  if (parts.length > 0) {
    return parts.filter((part) => part.length > 0);
  }

  if (typeof content.text === "string" && content.text.length > 0) {
    return [content.text];
  }

  return [];
}

function shouldIncludeMessage(message: ChatGPTConversationMessage) {
  if (
    !message.content ||
    message.metadata?.is_visually_hidden_from_conversation === true
  ) {
    return false;
  }

  const role = message.author?.role;
  const contentType = message.content.content_type;

  if (role === "user") {
    return contentType === "text";
  }

  if (role !== "assistant") {
    return false;
  }

  if (message.recipient && message.recipient !== "all") {
    return false;
  }

  if (message.channel !== "final") {
    return false;
  }

  return contentType === "text" || contentType === "code";
}

function parseContentBlocks(
  message: ChatGPTConversationMessage
): OpenChatContentBlock[] {
  const contentType = message.content?.content_type;
  if (!message.content) {
    return [];
  }

  if (contentType === "code") {
    const code = extractTextParts(message.content).join("\n\n");
    if (!code) return [];

    return [
      {
        type: "code",
        language:
          typeof message.content.language === "string"
            ? message.content.language
            : "unknown",
        code,
      },
    ];
  }

  return extractTextParts(message.content).map((text) => ({
    type: "text",
    text,
  }));
}

function parseMessage(
  message: ChatGPTConversationMessage,
  parentPlatformMessageId?: string
): OpenChatMessage | null {
  const content = parseContentBlocks(message);
  if (content.length === 0) {
    return null;
  }

  const role = message.author?.role === "assistant" ? "assistant" : "user";
  const timestamp =
    toIsoTimestamp(message.create_time) ?? toIsoTimestamp(message.update_time);
  const metadata = message.metadata ?? {};
  const model =
    typeof metadata.resolved_model_slug === "string"
      ? metadata.resolved_model_slug
      : typeof metadata.model_slug === "string"
      ? metadata.model_slug
      : undefined;

  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp,
    model,
    platformMessageId: message.id,
    parentId: parentPlatformMessageId,
  };
}

export function parseChatGPTConversation(
  data: ChatGPTConversationResponse,
  url: string
): OpenChatConversation {
  if (!data.conversation_id) {
    throw new Error("ChatGPT conversation payload is missing conversation_id");
  }

  const lineageIds = getLineageIds(data);

  const messages: OpenChatMessage[] = [];
  let previousVisiblePlatformMessageId: string | undefined;
  let latestAssistantModel: string | undefined;

  for (const nodeId of lineageIds) {
    const node = data.mapping[nodeId];
    const message = node?.message;
    if (!message || !shouldIncludeMessage(message)) continue;

    const parsed = parseMessage(message, previousVisiblePlatformMessageId);
    if (!parsed) continue;

    if (parsed.role === "assistant" && parsed.model) {
      latestAssistantModel = parsed.model;
    }

    messages.push(parsed);
    previousVisiblePlatformMessageId = message.id;
  }

  const createdAt =
    toIsoTimestamp(data.create_time) ??
    messages[0]?.timestamp ??
    new Date().toISOString();
  const updatedAt =
    toIsoTimestamp(data.update_time) ??
    messages.at(-1)?.timestamp ??
    createdAt;

  return {
    id: crypto.randomUUID(),
    title: data.title || "Untitled",
    createdAt,
    updatedAt,
    source: {
      platform: "chatgpt",
      conversationId: data.conversation_id,
      url,
      model:
        latestAssistantModel ?? data.default_model_slug ?? undefined,
    },
    messages,
  };
}
