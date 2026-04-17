export type Platform = "chatgpt" | "claude";

export type Role = "system" | "user" | "assistant";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface CodeBlock {
  type: "code";
  language: string;
  code: string;
}

export interface ImageBlock {
  type: "image";
  url: string;
  alt?: string;
}

export interface ThinkingBlock {
  type: "thinking";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export interface ArtifactBlock {
  type: "artifact";
  identifier: string;
  title: string;
  content: string;
  mimeType: string;
}

export type ContentBlock =
  | TextBlock
  | CodeBlock
  | ImageBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ArtifactBlock;

export interface Attachment {
  filename: string;
  mimeType: string;
  url?: string;
  content?: string;
}

export interface PreviousConversationRef {
  platform: Platform;
  conversationId: string;
}

export interface Source {
  platform: Platform;
  conversationId: string;
  url: string;
  model?: string;
  previousConversations?: PreviousConversationRef[];
}

export interface BranchEntry {
  conversationId: string;
  atMessageId: string;
  title: string;
  createdAt: string;
}

export interface BranchInfo {
  branchedFromId?: string;
  branchPointMessageId?: string;
  branches?: BranchEntry[];
}

export interface MessageMetadata {
  originalPlatform?: Platform;
}

export interface Message {
  id: string;
  role: Role;
  content: ContentBlock[];
  timestamp?: string;
  model?: string;
  parentId?: string;
  platformMessageId?: string;
  attachments?: Attachment[];
  metadata?: MessageMetadata;
}

export interface ProviderChangeRecord {
  from: Platform;
  to: Platform;
  at: string;
}

export interface ConversationMetadata {
  providerChanged?: boolean;
  lastProviderChange?: ProviderChangeRecord;
  branchInfo?: BranchInfo;
  [key: string]: unknown;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  source: Source;
  messages: Message[];
  metadata?: ConversationMetadata;
}
