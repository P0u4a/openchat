import type {
  OpenChatConversation,
  OpenChatMessage,
  OpenChatContentBlock,
} from "../schema/conversation.js";

interface ClaudeContentBlock {
  type: "text" | "thinking";
  text?: string;
  thinking?: string;
  citations?: unknown[];
  summaries?: unknown[];
  start_timestamp?: string;
  stop_timestamp?: string;
  cut_off?: boolean;
  truncated?: boolean;
}

interface ClaudeChatMessage {
  uuid: string;
  text: string;
  content: ClaudeContentBlock[];
  sender: "human" | "assistant";
  index: number;
  created_at: string;
  updated_at: string;
  truncated: boolean;
  stop_reason?: string;
  attachments: unknown[];
  files: unknown[];
  files_v2: unknown[];
  sync_sources: unknown[];
  parent_message_uuid: string;
}

export interface ClaudeConversationResponse {
  uuid: string;
  name: string;
  summary: string;
  model: string;
  created_at: string;
  updated_at: string;
  settings: Record<string, unknown>;
  is_starred: boolean;
  is_temporary: boolean;
  platform: string;
  current_leaf_message_uuid: string | null;
  chat_messages: ClaudeChatMessage[];
}

function parseContentBlock(block: ClaudeContentBlock): OpenChatContentBlock {
  if (block.type === "thinking") {
    return {
      type: "thinking",
      text: block.thinking ?? "",
    };
  }

  return {
    type: "text",
    text: block.text ?? "",
  };
}

function parseMessage(
  msg: ClaudeChatMessage,
  knownMessageUuids: Set<string>
): OpenChatMessage {
  const role = msg.sender === "human" ? "user" : "assistant";
  const content = msg.content.map(parseContentBlock);

  // Only set parentId if it references an actual message in the conversation
  const parentId = knownMessageUuids.has(msg.parent_message_uuid)
    ? msg.parent_message_uuid
    : undefined;

  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: msg.created_at,
    platformMessageId: msg.uuid,
    parentId,
  };
}

export function parseClaudeConversation(
  data: ClaudeConversationResponse,
  url: string
): OpenChatConversation {
  const messageUuids = new Set(data.chat_messages.map((m) => m.uuid));
  const messages = data.chat_messages
    .toSorted((a, b) => a.index - b.index)
    .map((msg) => parseMessage(msg, messageUuids));

  return {
    id: crypto.randomUUID(),
    title: data.name || "Untitled",
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    source: {
      platform: "claude",
      conversationId: data.uuid,
      url,
      model: data.model,
    },
    messages,
  };
}
