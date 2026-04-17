import type { Conversation } from "./types.ts";

export interface BridgeSyncRequest {
  conversations: Conversation[];
}

export interface BridgeUpsertRequest {
  conversation: Conversation;
}

export interface BridgeResponseOk {
  ok: true;
  name: "openchat";
  [key: string]: unknown;
}

export interface BridgeResponseError {
  ok: false;
  name: "openchat";
  error: string;
}

export type BridgeResponse = BridgeResponseOk | BridgeResponseError;
