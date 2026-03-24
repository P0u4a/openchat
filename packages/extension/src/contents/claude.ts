/* Claude content script
 * Injects a fetch interceptor into the page context
 * to capture conversation API responses
 * Relays captured data to the background service worker
 */

import { claudeFetchIntercept } from "./claude-intercept.js";
import { CLAUDE_ORIGIN } from "../lib/constants.js";

function injectInterceptor() {
  const script = document.createElement("script");
  script.textContent = `(${claudeFetchIntercept.toString()})("${CLAUDE_ORIGIN}");`;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

function relayToBackground() {
  window.addEventListener("message", (event) => {
    if (event.origin !== CLAUDE_ORIGIN) return;
    if (event.source !== window) return;
    if (event.data?.type !== "openchat:claude:conversation") return;

    chrome.runtime.sendMessage({
      type: "openchat:conversation-captured",
      platform: "claude",
      url: `${CLAUDE_ORIGIN}/chat/${event.data.data.uuid}`,
      data: event.data.data,
    });
  });
}

injectInterceptor();
relayToBackground();
