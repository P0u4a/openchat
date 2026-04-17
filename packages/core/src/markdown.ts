import type { ContentBlock, Conversation, Message } from "./types.ts";

export const OPENCHAT_REF_PREFIX = "[openchat:ref:";
export const OPENCHAT_REF_SUFFIX = "]";
export const PASTE_START_MARKER = "<prev_conversation>";
export const PASTE_END_MARKER = "</prev_conversation>";
export const PASTE_REPLY_LABEL = "↩ Reply to previous conversation:\n";

export type MarkdownMode = "rich" | "simple";

export interface FormatConversationOptions {
  mode: MarkdownMode;
  includeRef?: boolean;
  lastMessageId?: string;
}

export function stripOpenChatRef(text: string): string {
  return text
    .replace(/\[openchat:ref:[^\]]+\]\n*/g, "")
    .replace(
      new RegExp(
        `${escapeRegex(PASTE_START_MARKER)}\n*([\\s\\S]*?)\n*${escapeRegex(PASTE_END_MARKER)}`,
        "g"
      ),
      (_, pastedContent) => {
        const snippet = pastedContent.slice(0, 100).replace(/\n/g, " ").trim();
        const ellipsis = pastedContent.length > 100 ? "..." : "";
        return `${PASTE_REPLY_LABEL}> ${snippet}${ellipsis}`;
      }
    )
    .trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderSimpleBlock(block: ContentBlock): string {
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

function renderRichBlock(block: ContentBlock): string {
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

export function renderContentBlock(
  block: ContentBlock,
  mode: MarkdownMode = "rich"
): string {
  return mode === "rich" ? renderRichBlock(block) : renderSimpleBlock(block);
}

function formatMessageMetadata(message: Message): string | null {
  const parts: string[] = [];
  if (message.model) {
    parts.push(`Model: ${message.model}`);
  }
  return parts.length > 0 ? `_${parts.join(" · ")}_` : null;
}

export function formatMessageMarkdown(
  message: Message,
  conversationId?: string,
  lastMessageId?: string
): string {
  const content = message.content
    .map((block) => renderSimpleBlock(block))
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

function formatSimple(
  conversation: Conversation,
  includeRef: boolean,
  lastMessageId?: string
): string {
  const lines: string[] = [];

  if (includeRef) {
    const msgIdPart = lastMessageId ? `:${lastMessageId}` : "";
    lines.push(
      `${OPENCHAT_REF_PREFIX}${conversation.id}${msgIdPart}${OPENCHAT_REF_SUFFIX}`,
      ""
    );
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

function formatRich(conversation: Conversation): string {
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

  for (const message of conversation.messages) {
    lines.push(`## ${message.role}`);
    lines.push("");

    const metadata = formatMessageMetadata(message);
    if (metadata) {
      lines.push(metadata);
      lines.push("");
    }

    for (const block of message.content) {
      lines.push(renderRichBlock(block));
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
  }

  return lines.join("\n").trimEnd();
}

export function formatConversationMarkdown(
  conversation: Conversation,
  options: FormatConversationOptions
): string {
  if (options.mode === "rich") {
    return formatRich(conversation);
  }
  return formatSimple(conversation, options.includeRef ?? true, options.lastMessageId);
}
