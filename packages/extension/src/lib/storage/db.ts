import { openDB, type IDBPDatabase } from "idb";
import type { OpenChatConversation } from "../schema/conversation.js";

const DB_NAME = "openchat";
const DB_VERSION = 1;
const STORE_NAME = "conversations";

export interface OpenChatDB {
  conversations: {
    key: string;
    value: OpenChatConversation;
    indexes: {
      "by-platform": string;
      "by-platform-id": [string, string];
      "by-updated": string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  return (
    dbPromise ??
    openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by-platform", "source.platform");
        store.createIndex("by-platform-id", [
          "source.platform",
          "source.conversationId",
        ]);
        store.createIndex("by-updated", "updatedAt");
      },
    })
  );
}

export async function upsertConversation(
  conversation: OpenChatConversation
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index("by-platform-id");

  const existing = await index.get([
    conversation.source.platform,
    conversation.source.conversationId,
  ]);

  if (existing) {
    const updated: OpenChatConversation = {
      ...existing,
      title: conversation.title || existing.title,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages,
      source: { ...existing.source, ...conversation.source },
      metadata: { ...existing.metadata, ...conversation.metadata },
    };
    await store.put(updated);
  } else {
    await store.put(conversation);
  }

  await tx.done;
}

export async function getConversation(
  id: string
): Promise<OpenChatConversation | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id);
}

export async function getAllConversations(): Promise<OpenChatConversation[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE_NAME, "by-updated");
  // Most recent chat first
  return all.reverse();
}

export async function getConversationsByPlatform(
  platform: string
): Promise<OpenChatConversation[]> {
  const db = await getDB();
  return db.getAllFromIndex(STORE_NAME, "by-platform", platform);
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}
