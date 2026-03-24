import { z } from "zod";

export const providerSchema = z.enum(["chatgpt", "claude"]);

export const textBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const codeBlockSchema = z.object({
  type: z.literal("code"),
  language: z.string(),
  code: z.string(),
});

export const imageBlockSchema = z.object({
  type: z.literal("image"),
  url: z.string(),
  alt: z.string().optional(),
});

export const thinkingBlockSchema = z.object({
  type: z.literal("thinking"),
  text: z.string(),
});

export const toolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
});

export const toolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  toolUseId: z.string(),
  content: z.string(),
  isError: z.boolean().optional(),
});

export const artifactBlockSchema = z.object({
  type: z.literal("artifact"),
  identifier: z.string(),
  title: z.string(),
  content: z.string(),
  mimeType: z.string(),
});

export const contentBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  codeBlockSchema,
  imageBlockSchema,
  thinkingBlockSchema,
  toolUseBlockSchema,
  toolResultBlockSchema,
  artifactBlockSchema,
]);

export const attachmentSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  url: z.string().optional(),
  content: z.string().optional(),
});

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  content: z.array(contentBlockSchema),
  timestamp: z.string().optional(),
  model: z.string().optional(),
  parentId: z.string().optional(),
  platformMessageId: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  source: z.object({
    platform: providerSchema,
    conversationId: z.string(),
    url: z.string(),
    model: z.string().optional(),
  }),
  messages: z.array(messageSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const storeSchema = z.union([
  z.array(conversationSchema),
  z.object({
    conversations: z.array(conversationSchema),
  }),
]);

export type OpenChatProvider = z.infer<typeof providerSchema> | (string & {});
export type OpenChatConversation = z.infer<typeof conversationSchema>;
export type OpenChatMessage = z.infer<typeof messageSchema>;
export type OpenChatContentBlock = z.infer<typeof contentBlockSchema>;

export const bridgeSyncRequestSchema = z.object({
  conversations: z.array(conversationSchema),
});

export const bridgeUpsertRequestSchema = z.object({
  conversation: conversationSchema,
});

export type ResourceEntry = {
  conversation: OpenChatConversation;
  provider: OpenChatProvider;
  slug: string;
  title: string;
  uri: string;
};
