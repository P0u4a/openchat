import { openDB, type IDBPDatabase } from "idb";
import type {
  ConversationStorage,
  Conversation,
  Platform,
} from "@p0u4a/openchat-core";

const DB_NAME = "openchat";
const DB_VERSION = 1;
const STORE_NAME = "conversations";

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

export const storage: ConversationStorage = {
  async upsert(conversation) {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("by-platform-id");

    const existing = (await index.get([
      conversation.source.platform,
      conversation.source.conversationId,
    ])) as Conversation | undefined;

    if (existing) {
      const updated: Conversation = {
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
  },

  async get(id) {
    const db = await getDB();
    return (await db.get(STORE_NAME, id)) as Conversation | undefined;
  },

  async getAll() {
    const db = await getDB();
    const all = (await db.getAllFromIndex(
      STORE_NAME,
      "by-updated"
    )) as Conversation[];
    return all.reverse();
  },

  async getByPlatform(platform: Platform) {
    const db = await getDB();
    return (await db.getAllFromIndex(
      STORE_NAME,
      "by-platform",
      platform
    )) as Conversation[];
  },

  async delete(id) {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
  },
};
