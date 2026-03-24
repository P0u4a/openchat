import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { type OpenChatConversation, storeSchema } from "./schema";
import { sortConversations } from "./utils/conversation";

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
): Promise<OpenChatConversation[]> {
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

export async function upsertConversation(
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

export function withStoreMutation<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = storeMutationQueue.then(operation, operation);
  storeMutationQueue = nextOperation.then(
    () => undefined,
    () => undefined
  );

  return nextOperation;
}
