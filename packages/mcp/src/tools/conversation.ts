import { z } from "zod";
import { buildResourceIndex } from "../resources";
import type { Conversation } from "@p0u4a/openchat-core";
import type { ResourceEntry } from "../schema";

export const searchConversationsSchema = {
  pattern: z
    .string()
    .describe("Regex pattern to match against conversation titles"),
};

function formatMatch(entry: ResourceEntry) {
  return [
    `- **${entry.title}**`,
    `  - URI: \`${entry.uri}\``,
    `  - Provider: ${entry.provider}`,
  ].join("\n");
}

export type LoadConversations = () => Promise<Conversation[]>;

export function searchConversations(
  loadConversations: LoadConversations
) {
  return async ({ pattern }: { pattern: string }) => {
    const regex = new RegExp(pattern, "i");
    const { entries } = buildResourceIndex(await loadConversations());
    const matches = entries.filter((entry) => regex.test(entry.title));

    if (matches.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No conversations matched the pattern \`${pattern}\`.`,
          },
        ],
      };
    }

    const text = [
      `Found ${matches.length} conversation(s) matching \`${pattern}\`:\n`,
      ...matches.map(formatMatch),
    ].join("\n");

    return {
      content: [{ type: "text" as const, text }],
    };
  };
}
