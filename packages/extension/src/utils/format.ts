import type { Platform } from "@p0u4a/openchat-core";
import { CHATGPT_ORIGIN, CLAUDE_ORIGIN } from "../lib/constants";

export function decodeBase64(value: string): string | null {
  try {
    return globalThis.atob(value);
  } catch {
    return null;
  }
}

export function toIsoTimestamp(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Date(numeric * 1000).toISOString();
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return undefined;
}

export function buildOpenInChatUrl(platform: Platform, text: string): string {
  const encoded = encodeURIComponent(text);
  return platform === "chatgpt"
    ? `${CHATGPT_ORIGIN}/?prompt=${encoded}`
    : `${CLAUDE_ORIGIN}/new?q=${encoded}`;
}
