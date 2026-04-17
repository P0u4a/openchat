import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";
import {
  sortConversations,
  type Conversation,
  type ConversationStorage,
  type Platform,
} from "@p0u4a/openchat-core";
import { storeSchema } from "./schema";

const STORE_PATH_ENV = "OPENCHAT_STORE_PATH";
const DEFAULT_STORE_PATH = resolve(
  homedir(),
  ".openchat",
  "conversations.json"
);

let storeMutationQueue = Promise.resolve();

export function resolveStorePath(argPath?: string): string {
  if (argPath) {
    return resolve(process.cwd(), argPath);
  }

  const envPath = process.env[STORE_PATH_ENV];
  if (envPath) {
    return resolve(process.cwd(), envPath);
  }

  return DEFAULT_STORE_PATH;
}

export async function loadConversations(
  storePath: string
): Promise<Conversation[]> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = storeSchema.parse(JSON.parse(raw));

    return Array.isArray(parsed) ? parsed : parsed.conversations;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }

    throw error;
  }
}

export async function saveConversations(
  storePath: string,
  conversations: Conversation[]
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

export async function upsertConversation(
  storePath: string,
  conversation: Conversation
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

export function withStoreMutation<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = storeMutationQueue.then(operation, operation);
  storeMutationQueue = nextOperation.then(
    () => undefined,
    () => undefined
  );

  return nextOperation;
}

export function createFileStorage(storePath: string): ConversationStorage {
  return {
    async upsert(conversation) {
      await withStoreMutation(() => upsertConversation(storePath, conversation));
    },
    async get(id) {
      const conversations = await loadConversations(storePath);
      return conversations.find((c) => c.id === id);
    },
    async getAll() {
      return sortConversations(await loadConversations(storePath));
    },
    async getByPlatform(platform: Platform) {
      const conversations = await loadConversations(storePath);
      return conversations.filter((c) => c.source.platform === platform);
    },
    async delete(id) {
      await withStoreMutation(async () => {
        const conversations = await loadConversations(storePath);
        const next = conversations.filter((c) => c.id !== id);
        if (next.length !== conversations.length) {
          await saveConversations(storePath, next);
        }
      });
    },
  };
}
