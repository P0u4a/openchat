import type {
  OpenChatContentBlock,
  OpenChatConversation,
  OpenChatMessage,
} from "../schema";

export function slugify(title: string): string {
  const normalized = title
    .toLowerCase()
    .trim()
    .replaceAll(/['"]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return normalized || "untitled";
}

export function stableConversationSuffix(
  conversation: OpenChatConversation
): string {
  const suffix = slugify(
    conversation.source.conversationId || conversation.id
  ).replace(/^untitled$/, "conversation");

  return suffix;
}

export function formatConversationMarkdown(
  conversation: OpenChatConversation
): string {
  const lines: string[] = [
    `# ${conversation.title || "Untitled"}`,
    "",
    `- Provider: ${conversation.source.platform}`,
    `- Conversation ID: ${conversation.source.conversationId}`,
    `- Created: ${conversation.createdAt}`,
    `- Updated: ${conversation.updatedAt}`,
    `- Source URL: ${conversation.source.url}`,
  ];

  if (conversation.source.model) {
    lines.push(`- Default Model: ${conversation.source.model}`);
  }

  lines.push("");

  conversation.messages.forEach((message, index) => {
    lines.push(`## ${message.role}`);
    lines.push("");

    const metadata = formatMessageMetadata(message);
    if (metadata) {
      lines.push(metadata);
      lines.push("");
    }

    for (const block of message.content) {
      lines.push(renderContentBlock(block));
      lines.push("");
    }

    if (message.attachments?.length) {
      lines.push("### Attachments");
      lines.push("");

      for (const attachment of message.attachments) {
        lines.push(`- ${attachment.filename} (${attachment.mimeType})`);
      }

      lines.push("");
    }
  });

  return lines.join("\n").trimEnd();
}

export function formatMessageMetadata(message: OpenChatMessage): string | null {
  const parts: string[] = [];

  if (message.model) {
    parts.push(`Model: ${message.model}`);
  }

  return parts.length > 0 ? `_${parts.join(" · ")}_` : null;
}

export function renderContentBlock(block: OpenChatContentBlock): string {
  switch (block.type) {
    case "text":
      return block.text;
    case "code":
      return [`\`\`\`${block.language || "text"}`, block.code, "```"].join(
        "\n"
      );
    case "image":
      return block.alt ? `![${block.alt}](${block.url})` : `![](${block.url})`;
    case "thinking":
      return [
        "<details>",
        "<summary>Thinking</summary>",
        "",
        block.text,
        "",
        "</details>",
      ].join("\n");
    case "tool_use":
      return [
        `### Tool Use · ${block.name}`,
        "",
        `- ID: ${block.id}`,
        "",
        "```json",
        JSON.stringify(block.input, null, 2),
        "```",
      ].join("\n");
    case "tool_result":
      return [
        `### Tool Result${block.isError ? " · Error" : ""}`,
        "",
        `- Tool Use ID: ${block.toolUseId}`,
        "",
        "```text",
        block.content,
        "```",
      ].join("\n");
    case "artifact":
      return [
        `### Artifact · ${block.title}`,
        "",
        `- Identifier: ${block.identifier}`,
        `- MIME Type: ${block.mimeType}`,
        "",
        "```",
        block.content,
        "```",
      ].join("\n");
  }
}

export function sortConversations(
  conversations: OpenChatConversation[]
): OpenChatConversation[] {
  return conversations.toSorted(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
}
