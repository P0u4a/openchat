import { CLAUDE_ORIGIN, CHATGPT_ORIGIN } from "../lib/constants.js";

const SUPPORTED_ORIGINS = [CLAUDE_ORIGIN, CHATGPT_ORIGIN];

export function isSupportedPage(url: string): boolean {
  return SUPPORTED_ORIGINS.some((origin) => url.startsWith(origin));
}
