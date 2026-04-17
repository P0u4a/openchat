import { z } from "zod";
import type {
  Attachment as CoreAttachment,
  BranchEntry as CoreBranchEntry,
  BranchInfo as CoreBranchInfo,
  ContentBlock as CoreContentBlock,
  Conversation as CoreConversation,
  Message as CoreMessage,
  MessageMetadata as CoreMessageMetadata,
  Platform as CorePlatform,
  Source as CoreSource,
} from "@p0u4a/openchat-core";

export type {
  Attachment,
  BranchEntry,
  BranchInfo,
  ContentBlock,
  Conversation,
  Message,
  MessageMetadata,
  Platform,
  Source,
} from "@p0u4a/openchat-core";

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

export const messageMetadataSchema = z.object({
  originalPlatform: providerSchema.optional(),
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
  metadata: messageMetadataSchema.optional(),
});

export const branchEntrySchema = z.object({
  conversationId: z.string(),
  atMessageId: z.string(),
  title: z.string(),
  createdAt: z.string(),
});

export const branchInfoSchema = z.object({
  branchedFromId: z.string().optional(),
  branchPointMessageId: z.string().optional(),
  branches: z.array(branchEntrySchema).optional(),
});

export const sourceSchema = z.object({
  platform: providerSchema,
  conversationId: z.string(),
  url: z.string(),
  model: z.string().optional(),
  previousConversations: z
    .array(
      z.object({
        platform: providerSchema,
        conversationId: z.string(),
      })
    )
    .optional(),
});

export const conversationMetadataSchema = z
  .object({
    providerChanged: z.boolean().optional(),
    lastProviderChange: z
      .object({
        from: providerSchema,
        to: providerSchema,
        at: z.string(),
      })
      .optional(),
    branchInfo: branchInfoSchema.optional(),
  })
  .catchall(z.unknown());

export const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  source: sourceSchema,
  messages: z.array(messageSchema),
  metadata: conversationMetadataSchema.optional(),
});

export const storeSchema = z.union([
  z.array(conversationSchema),
  z.object({
    conversations: z.array(conversationSchema),
  }),
]);

export const bridgeSyncRequestSchema = z.object({
  conversations: z.array(conversationSchema),
});

export const bridgeUpsertRequestSchema = z.object({
  conversation: conversationSchema,
});

export type ResourceEntry = {
  conversation: CoreConversation;
  provider: CorePlatform;
  slug: string;
  title: string;
  uri: string;
};

type AssertExtends<T extends U, U> = T;
type _AssertPlatform = AssertExtends<z.infer<typeof providerSchema>, CorePlatform>;
type _AssertAttachment = AssertExtends<z.infer<typeof attachmentSchema>, CoreAttachment>;
type _AssertBranchEntry = AssertExtends<z.infer<typeof branchEntrySchema>, CoreBranchEntry>;
type _AssertBranchInfo = AssertExtends<z.infer<typeof branchInfoSchema>, CoreBranchInfo>;
type _AssertContentBlock = AssertExtends<z.infer<typeof contentBlockSchema>, CoreContentBlock>;
type _AssertMessageMetadata = AssertExtends<z.infer<typeof messageMetadataSchema>, CoreMessageMetadata>;
type _AssertMessage = AssertExtends<z.infer<typeof messageSchema>, CoreMessage>;
type _AssertSource = AssertExtends<z.infer<typeof sourceSchema>, CoreSource>;
type _AssertConversation = AssertExtends<z.infer<typeof conversationSchema>, CoreConversation>;
