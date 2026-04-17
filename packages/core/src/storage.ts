import type { Conversation, Platform } from "./types.ts";

export interface ConversationStorage {
  upsert(conversation: Conversation): Promise<void>;
  get(id: string): Promise<Conversation | undefined>;
  getAll(): Promise<Conversation[]>;
  getByPlatform(platform: Platform): Promise<Conversation[]>;
  delete(id: string): Promise<void>;
}

export function sortConversations(
  conversations: Conversation[]
): Conversation[] {
  return conversations.toSorted(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
}
