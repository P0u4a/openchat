#!/usr/bin/env node

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";

import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const providerSchema = z.enum(["chatgpt", "claude"]);

const textBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const codeBlockSchema = z.object({
  type: z.literal("code"),
  language: z.string(),
  code: z.string(),
});

const imageBlockSchema = z.object({
  type: z.literal("image"),
  url: z.string(),
  alt: z.string().optional(),
});

const thinkingBlockSchema = z.object({
  type: z.literal("thinking"),
  text: z.string(),
});

const toolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
});

const toolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  toolUseId: z.string(),
  content: z.string(),
  isError: z.boolean().optional(),
});

const artifactBlockSchema = z.object({
  type: z.literal("artifact"),
  identifier: z.string(),
  title: z.string(),
  content: z.string(),
  mimeType: z.string(),
});

const contentBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  codeBlockSchema,
  imageBlockSchema,
  thinkingBlockSchema,
  toolUseBlockSchema,
  toolResultBlockSchema,
  artifactBlockSchema,
]);

const attachmentSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  url: z.string().optional(),
  content: z.string().optional(),
});

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  content: z.array(contentBlockSchema),
  timestamp: z.string().optional(),
  model: z.string().optional(),
  parentId: z.string().optional(),
  platformMessageId: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

const conversationSchema = z.object({
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

const storeSchema = z.union([
  z.array(conversationSchema),
  z.object({
    conversations: z.array(conversationSchema),
  }),
]);

type OpenChatProvider = z.infer<typeof providerSchema> | (string & {});
type OpenChatConversation = z.infer<typeof conversationSchema>;
type OpenChatMessage = z.infer<typeof messageSchema>;
type OpenChatContentBlock = z.infer<typeof contentBlockSchema>;

const bridgeSyncRequestSchema = z.object({
  conversations: z.array(conversationSchema),
});

const bridgeUpsertRequestSchema = z.object({
  conversation: conversationSchema,
});

type ResourceEntry = {
  conversation: OpenChatConversation;
  provider: OpenChatProvider;
  slug: string;
  title: string;
  uri: string;
};

const STORE_PATH_ENV = "OPENCHAT_STORE_PATH";
const BRIDGE_PORT_ENV = "OPENCHAT_BRIDGE_PORT";
const DEFAULT_STORE_PATH = resolve(
  homedir(),
  ".openchat",
  "conversations.json"
);
const DEFAULT_BRIDGE_PORT = 27124;
const BRIDGE_HOST = "127.0.0.1";
const URI_TEMPLATE = "chat://{provider}/{slug}";
const MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024;

let storeMutationQueue = Promise.resolve();

function resolveStorePath(): string {
  const argPath = getCliOption("--store");
  if (argPath) {
    return resolve(process.cwd(), argPath);
  }

  const envPath = process.env[STORE_PATH_ENV];
  if (envPath) {
    return resolve(process.cwd(), envPath);
  }

  return DEFAULT_STORE_PATH;
}

function getCliOption(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function resolveBridgePort(): number {
  const cliValue = getCliOption("--bridge-port");
  const envValue = process.env[BRIDGE_PORT_ENV];
  const rawValue = cliValue ?? envValue;

  if (!rawValue) {
    return DEFAULT_BRIDGE_PORT;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid OpenChat bridge port: ${rawValue}`);
  }

  return parsed;
}

async function loadConversations(
  storePath: string
): Promise<OpenChatConversation[]> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = storeSchema.parse(JSON.parse(raw));

    return Array.isArray(parsed) ? parsed : parsed.conversations;
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

async function saveConversations(
  storePath: string,
  conversations: OpenChatConversation[]
): Promise<void> {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(
    storePath,
    JSON.stringify(
      {
        conversations: sortConversations(conversations),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

async function upsertConversation(
  storePath: string,
  conversation: OpenChatConversation
): Promise<void> {
  const conversations = await loadConversations(storePath);
  const nextConversations = [...conversations];
  const existingIndex = nextConversations.findIndex(
    (candidate) =>
      candidate.source.platform === conversation.source.platform &&
      candidate.source.conversationId === conversation.source.conversationId
  );

  if (existingIndex === -1) {
    nextConversations.push(conversation);
  } else {
    nextConversations[existingIndex] = conversation;
  }

  await saveConversations(storePath, nextConversations);
}

function withStoreMutation<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = storeMutationQueue.then(operation, operation);
  storeMutationQueue = nextOperation.then(
    () => undefined,
    () => undefined
  );

  return nextOperation;
}

function sortConversations(
  conversations: OpenChatConversation[]
): OpenChatConversation[] {
  return conversations
    .slice()
    .sort((left, right) => compareDates(right.updatedAt, left.updatedAt));
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function buildResourceIndex(conversations: OpenChatConversation[]): {
  entries: ResourceEntry[];
  byProvider: Map<OpenChatProvider, ResourceEntry[]>;
  byUri: Map<string, ResourceEntry>;
} {
  const baseSlugCounts = new Map<string, number>();
  for (const conversation of conversations) {
    const key = `${conversation.source.platform}:${slugify(
      conversation.title
    )}`;
    baseSlugCounts.set(key, (baseSlugCounts.get(key) ?? 0) + 1);
  }

  const entries = sortConversations(conversations).map((conversation) => {
    const provider = conversation.source.platform;
    const baseSlug = slugify(conversation.title);
    const counterKey = `${provider}:${baseSlug}`;
    const slug =
      baseSlugCounts.get(counterKey) === 1
        ? baseSlug
        : `${baseSlug}-${stableConversationSuffix(conversation)}`;
    const uri = `chat://${provider}/${slug}`;

    return {
      conversation,
      provider,
      slug,
      title: conversation.title || "Untitled",
      uri,
    };
  });

  const byProvider = new Map<OpenChatProvider, ResourceEntry[]>();
  const byUri = new Map<string, ResourceEntry>();

  for (const entry of entries) {
    byUri.set(entry.uri, entry);

    const providerEntries = byProvider.get(entry.provider) ?? [];
    providerEntries.push(entry);
    byProvider.set(entry.provider, providerEntries);
  }

  return { entries, byProvider, byUri };
}

function compareDates(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function slugify(title: string): string {
  const normalized = title
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "untitled";
}

function stableConversationSuffix(conversation: OpenChatConversation): string {
  const suffix = slugify(
    conversation.source.conversationId || conversation.id
  ).replace(/^untitled$/, "conversation");

  return suffix;
}

function formatConversationMarkdown(
  conversation: OpenChatConversation
): string {
  const lines: string[] = [
    `# ${conversation.title || "Untitled"}`,
    "",
    `- Provider: ${formatProvider(conversation.source.platform)}`,
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
    lines.push(`## Message ${index + 1} · ${capitalize(message.role)}`);
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

function formatMessageMetadata(message: OpenChatMessage): string | null {
  const parts: string[] = [];

  if (message.timestamp) {
    parts.push(`Time: ${message.timestamp}`);
  }

  if (message.model) {
    parts.push(`Model: ${message.model}`);
  }

  if (message.platformMessageId) {
    parts.push(`Platform Message ID: ${message.platformMessageId}`);
  }

  return parts.length > 0 ? `_${parts.join(" · ")}_` : null;
}

function renderContentBlock(block: OpenChatContentBlock): string {
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

function formatProvider(provider: OpenChatProvider): string {
  switch (provider) {
    case "chatgpt":
      return "ChatGPT";
    case "claude":
      return "Claude";
    default:
      throw new Error("Unsupported Provider");
  }
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function buildResourceMetadata(entry: ResourceEntry) {
  return {
    name: entry.title,
    title: entry.title,
    description: `${formatProvider(entry.provider)} conversation`,
    mimeType: "text/markdown",
    annotations: {
      audience: ["assistant" as const],
      lastModified: entry.conversation.updatedAt,
    },
    _meta: {
      provider: entry.provider,
      createdAt: entry.conversation.createdAt,
      conversationId: entry.conversation.source.conversationId,
      sourceUrl: entry.conversation.source.url,
    },
  };
}

async function main(): Promise<void> {
  const storePath = resolveStorePath();
  const bridgePort = resolveBridgePort();
  await startBridgeServer(storePath, bridgePort);

  const server = new McpServer({
    name: "openchat",
    version: "0.0.1",
  });

  const resourceTemplate = new ResourceTemplate(URI_TEMPLATE, {
    list: async () => {
      const { entries } = buildResourceIndex(
        await loadConversations(storePath)
      );

      return {
        resources: entries.map((entry) => ({
          uri: entry.uri,
          ...buildResourceMetadata(entry),
        })),
      };
    },
    complete: {
      provider: (value) =>
        providerSchema.options.filter((provider) => provider.startsWith(value)),
      slug: async (value, context) => {
        const provider = context?.arguments?.provider;

        if (!providerSchema.safeParse(provider).success) {
          return [];
        }

        const { byProvider } = buildResourceIndex(
          await loadConversations(storePath)
        );
        const entries = byProvider.get(provider!) ?? [];

        return entries
          .map((entry) => entry.slug)
          .filter((slug) => slug.startsWith(value));
      },
    },
  });

  server.registerResource(
    "chat-history",
    resourceTemplate,
    {
      title: "OpenChat Histories",
      description:
        "Conversation histories captured by OpenChat, exposed as markdown resources.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const { byUri } = buildResourceIndex(await loadConversations(storePath));
      const entry = byUri.get(uri.toString());

      if (!entry) {
        throw new Error(`Conversation not found for URI ${uri.toString()}`);
      }

      return {
        contents: [
          {
            uri: entry.uri,
            mimeType: "text/markdown",
            text: formatConversationMarkdown(entry.conversation),
            _meta: {
              provider: entry.provider,
              createdAt: entry.conversation.createdAt,
              updatedAt: entry.conversation.updatedAt,
              conversationId: entry.conversation.source.conversationId,
            },
          },
        ],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[openchat] MCP server connected. Store path: ${storePath}\n`
  );
}

async function startBridgeServer(
  storePath: string,
  port: number
): Promise<Server | null> {
  const server = createServer((request, response) => {
    void handleBridgeRequest(request, response, storePath, port);
  });

  return await new Promise<Server | null>((resolvePromise, rejectPromise) => {
    const handleError = (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        process.stderr.write(
          `[openchat] Bridge already active on http://${BRIDGE_HOST}:${port}\n`
        );
        resolvePromise(null);
        return;
      }

      rejectPromise(error);
    };

    server.once("error", handleError);
    server.listen(port, BRIDGE_HOST, () => {
      server.off("error", handleError);
      process.stderr.write(
        `[openchat] Bridge listening on http://${BRIDGE_HOST}:${port}\n`
      );
      resolvePromise(server);
    });
  });
}

async function handleBridgeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  storePath: string,
  port: number
): Promise<void> {
  const corsHeaders = buildCorsHeaders(request);
  const origin = request.headers.origin;

  if (origin && !isAllowedBridgeOrigin(origin)) {
    sendJson(
      response,
      403,
      { ok: false, name: "openchat", error: "Forbidden origin" },
      corsHeaders
    );
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${BRIDGE_HOST}:${port}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(
      response,
      200,
      {
        ok: true,
        name: "openchat",
        transport: "http",
      },
      corsHeaders
    );
    return;
  }

  try {
    if (request.method === "POST" && url.pathname === "/conversations/sync") {
      const payload = bridgeSyncRequestSchema.parse(await readJsonBody(request));
      await withStoreMutation(() =>
        saveConversations(storePath, payload.conversations)
      );

      sendJson(
        response,
        200,
        {
          ok: true,
          name: "openchat",
          count: payload.conversations.length,
        },
        corsHeaders
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/conversations/upsert") {
      const payload = bridgeUpsertRequestSchema.parse(await readJsonBody(request));
      await withStoreMutation(() =>
        upsertConversation(storePath, payload.conversation)
      );

      sendJson(
        response,
        200,
        {
          ok: true,
          name: "openchat",
          conversationId: payload.conversation.source.conversationId,
        },
        corsHeaders
      );
      return;
    }

    sendJson(
      response,
      404,
      { ok: false, name: "openchat", error: "Not found" },
      corsHeaders
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = isPayloadTooLargeError(error) ? 413 : 400;
    sendJson(
      response,
      statusCode,
      { ok: false, name: "openchat", error: message },
      corsHeaders
    );
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.length;

    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      throw new Error("Request body too large");
    }

    chunks.push(bufferChunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(body);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  headers: Record<string, string>
): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...headers,
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body).toString(),
  });
  response.end(body);
}

function buildCorsHeaders(
  request: IncomingMessage
): Record<string, string> {
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
  const origin = request.headers.origin;

  if (origin && isAllowedBridgeOrigin(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }

  if (request.headers["access-control-request-private-network"] === "true") {
    headers["access-control-allow-private-network"] = "true";
  }

  return headers;
}

function isAllowedBridgeOrigin(origin: string): boolean {
  return origin.startsWith("chrome-extension://");
}

function isPayloadTooLargeError(error: unknown): boolean {
  return error instanceof Error && error.message === "Request body too large";
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[openchat] Failed to start MCP server: ${message}\n`);
  process.exit(1);
});
