import { Type, type Static } from "@sinclair/typebox";

export const TextBlock = Type.Object({
  type: Type.Literal("text"),
  text: Type.String(),
});

export const CodeBlock = Type.Object({
  type: Type.Literal("code"),
  language: Type.String(),
  code: Type.String(),
});

export const ImageBlock = Type.Object({
  type: Type.Literal("image"),
  url: Type.String(),
  alt: Type.Optional(Type.String()),
});

export const ThinkingBlock = Type.Object({
  type: Type.Literal("thinking"),
  text: Type.String(),
});

export const ToolUseBlock = Type.Object({
  type: Type.Literal("tool_use"),
  id: Type.String(),
  name: Type.String(),
  input: Type.Record(Type.String(), Type.Unknown()),
});

export const ToolResultBlock = Type.Object({
  type: Type.Literal("tool_result"),
  toolUseId: Type.String(),
  content: Type.String(),
  isError: Type.Optional(Type.Boolean()),
});

export const ArtifactBlock = Type.Object({
  type: Type.Literal("artifact"),
  identifier: Type.String(),
  title: Type.String(),
  content: Type.String(),
  mimeType: Type.String(),
});

export const ContentBlock = Type.Union([
  TextBlock,
  CodeBlock,
  ImageBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  ArtifactBlock,
]);

export const Attachment = Type.Object({
  filename: Type.String(),
  mimeType: Type.String(),
  url: Type.Optional(Type.String()),
  content: Type.Optional(Type.String()),
});

export const Platform = Type.Union([
  Type.Literal("chatgpt"),
  Type.Literal("claude"),
]);

export const Source = Type.Object({
  platform: Platform,
  conversationId: Type.String(),
  url: Type.String(),
  model: Type.Optional(Type.String()),
  previousConversations: Type.Optional(
    Type.Array(
      Type.Object({
        platform: Platform,
        conversationId: Type.String(),
      })
    )
  ),
});

export const MessageMetadata = Type.Object({
  originalPlatform: Type.Optional(Platform),
});

export const Message = Type.Object({
  id: Type.String(),
  role: Type.Union([
    Type.Literal("system"),
    Type.Literal("user"),
    Type.Literal("assistant"),
  ]),
  content: Type.Array(ContentBlock),
  timestamp: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  parentId: Type.Optional(Type.String()),
  platformMessageId: Type.Optional(Type.String()),
  attachments: Type.Optional(Type.Array(Attachment)),
  metadata: Type.Optional(MessageMetadata),
});

export const Conversation = Type.Object({
  id: Type.String(),
  title: Type.String(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
  source: Source,
  messages: Type.Array(Message),
  metadata: Type.Optional(
    Type.Intersect([
      Type.Record(Type.String(), Type.Unknown()),
      Type.Object({
        providerChanged: Type.Optional(Type.Boolean()),
        lastProviderChange: Type.Optional(
          Type.Object({
            from: Platform,
            to: Platform,
            at: Type.String(),
          })
        ),
      }),
    ])
  ),
});

export type OpenChatContentBlock = Static<typeof ContentBlock>;
export type OpenChatMessage = Static<typeof Message>;
export type OpenChatConversation = Static<typeof Conversation>;
export type OpenChatPlatform = Static<typeof Platform>;
export type OpenChatAttachment = Static<typeof Attachment>;
export type OpenChatMessageMetadata = Static<typeof MessageMetadata>;
