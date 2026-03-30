import type {
  OpenChatContentBlock,
  OpenChatConversation,
  OpenChatMessage,
} from "../lib/schema/conversation.js";

export const OPENCHAT_REF_PREFIX = "[openchat:ref:";
export const OPENCHAT_REF_SUFFIX = "]";
export const PASTE_START_MARKER = "<prev_conversation>";
export const PASTE_END_MARKER = "</prev_conversation>";

export function stripOpenChatRef(text: string): string {
  return text
    .replace(/\[openchat:ref:[^\]]+\]\n*/g, "")
    .replace(
      new RegExp(
        `${escapeRegex(PASTE_START_MARKER)}[\\s\\S]*?${escapeRegex(PASTE_END_MARKER)}`,
        "g"
      ),
      ""
    )
    .trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderContentBlock(block: OpenChatContentBlock): string {
  switch (block.type) {
    case "text":
      return block.text;
    case "code":
      return [`\`\`\`${block.language || "text"}`, block.code, "```"].join(
        "\n"
      );
    case "thinking":
      return "";
    case "tool_use":
      return `**Tool Use:** ${block.name}`;
    case "tool_result":
      return `**Tool Result:** ${block.content}`;
    case "image":
      return block.alt ? `![${block.alt}](${block.url})` : `![](${block.url})`;
    case "artifact":
      return [`**Artifact:** ${block.title}`, "", "```", block.content, "```"].join("\n");
  }
}

export function formatMessageMarkdown(
  message: OpenChatMessage,
  conversationId?: string,
  lastMessageId?: string
): string {
  const content = message.content
    .map(renderContentBlock)
    .filter(Boolean)
    .join("\n\n");

  if (conversationId) {
    const ref = lastMessageId
      ? `${OPENCHAT_REF_PREFIX}${conversationId}:${lastMessageId}${OPENCHAT_REF_SUFFIX}`
      : `${OPENCHAT_REF_PREFIX}${conversationId}${OPENCHAT_REF_SUFFIX}`;
    return `${PASTE_START_MARKER}\n${ref}\n\n${content}\n${PASTE_END_MARKER}`;
  }

  return content;
}

export function formatConversationMarkdown(
  conversation: OpenChatConversation,
  includeRef = true,
  lastMessageId?: string
): string {
  const lines: string[] = [];

  if (includeRef) {
    const msgIdPart = lastMessageId ? `:${lastMessageId}` : "";
    lines.push(`${OPENCHAT_REF_PREFIX}${conversation.id}${msgIdPart}${OPENCHAT_REF_SUFFIX}`, "");
  }

  lines.push(`# ${conversation.title || "Untitled"}`, "");

  for (const message of conversation.messages) {
    lines.push(`## ${message.role}:`, "");

    const content = formatMessageMarkdown(message);
    if (content) {
      lines.push(content, "");
    }
  }

  const content = lines.join("\n").trimEnd();

  if (includeRef) {
    return `${PASTE_START_MARKER}\n${content}\n${PASTE_END_MARKER}`;
  }

  return content;
}
