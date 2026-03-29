import type {
  OpenChatContentBlock,
  OpenChatConversation,
  OpenChatMessage,
} from "../lib/schema/conversation.js";

export const OPENCHAT_REF_PREFIX = "[openchat:ref:";
export const OPENCHAT_REF_SUFFIX = "]";

export function stripOpenChatRef(text: string): string {
  return text.replace(/\[openchat:ref:[^\]]+\]\n*/g, "").trim();
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
  conversationId?: string
): string {
  const content = message.content
    .map(renderContentBlock)
    .filter(Boolean)
    .join("\n\n");

  if (conversationId) {
    return `${OPENCHAT_REF_PREFIX}${conversationId}${OPENCHAT_REF_SUFFIX}\n\n${content}`;
  }

  return content;
}

export function formatConversationMarkdown(
  conversation: OpenChatConversation,
  includeRef = true
): string {
  const lines: string[] = [];

  if (includeRef) {
    lines.push(`${OPENCHAT_REF_PREFIX}${conversation.id}${OPENCHAT_REF_SUFFIX}`, "");
  }

  lines.push(`# ${conversation.title || "Untitled"}`, "");

  for (const message of conversation.messages) {
    lines.push(`## ${message.role}:`, "");

    const content = formatMessageMarkdown(message);
    if (content) {
      lines.push(content, "");
    }
  }

  return lines.join("\n").trimEnd();
}
