#!/usr/bin/env node

import process from "node:process";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { providerSchema } from "./schema";
import { buildResourceIndex, buildResourceMetadata } from "./resources";
import { formatConversationMarkdown } from "./utils/conversation";
import { loadConversations, resolveStorePath } from "./store";
import { resolveBridgePort, startBridgeServer } from "./http-bridge";
import { getCliOption } from "./utils/cli";
import {
  searchConversations,
  searchConversationsSchema,
} from "./tools/conversation";

const URI_TEMPLATE = "chat://{provider}/{slug}";

async function main(): Promise<void> {
  const storePathFlag = getCliOption("--store");
  const bridgePortFlag = getCliOption("--bridge-port");
  const storePath = resolveStorePath(storePathFlag);
  const bridgePort = resolveBridgePort(bridgePortFlag);

  const server = new McpServer({
    name: "openchat",
    version: "0.0.1",
  });

  await startBridgeServer({
    storePath,
    port: bridgePort,
    onConversationsChanged: () => server.sendResourceListChanged(),
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

  const load = () => loadConversations(storePath);

  server.registerTool(
    "search_conversations",
    {
      description:
        "Search conversation titles by regex pattern. Returns matching resource URIs that can be read individually.",
      inputSchema: searchConversationsSchema,
    },
    searchConversations(load)
  );

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

main().catch((error) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`[openchat] Failed to start MCP server: ${message}\n`);
  process.exit(1);
});
