import type {
  OpenChatContentBlock,
  OpenChatConversation,
  OpenChatMessage,
} from "../lib/schema/conversation.js";

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

export function formatMessageMarkdown(message: OpenChatMessage): string {
  return message.content
    .map(renderContentBlock)
    .filter(Boolean)
    .join("\n\n");
}

export function formatConversationMarkdown(
  conversation: OpenChatConversation
): string {
  const lines: string[] = [`# ${conversation.title || "Untitled"}`, ""];

  for (const message of conversation.messages) {
    lines.push(`## ${message.role}:`, "");

    const content = formatMessageMarkdown(message);
    if (content) {
      lines.push(content, "");
    }
  }

  return lines.join("\n").trimEnd();
}
