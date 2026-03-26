/* ChatGPT content script
 * Injects a fetch interceptor into the page context
 * to capture ChatGPT conversation API responses
 * Relays captured data to the background service worker
 */

import { CHATGPT_ORIGIN } from "../lib/constants.js";
import { tryPasteChat } from "../utils/paste-chat.js";

function injectInterceptor() {
  const parent = document.head || document.documentElement;
  if (!parent) {
    const observer = new MutationObserver(() => {
      const nextParent = document.head || document.documentElement;
      if (!nextParent) return;
      observer.disconnect();
      injectInterceptor();
    });

    observer.observe(document, {
      childList: true,
      subtree: true,
    });
    return;
  }

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("src/contents/chatgpt-intercept.js");
  script.dataset.origin = CHATGPT_ORIGIN;
  parent.prepend(script);
  script.remove();
}

function relayToBackground() {
  window.addEventListener("message", (event) => {
    if (event.origin !== CHATGPT_ORIGIN) return;
    if (event.source !== window) return;
    if (event.data?.type !== "openchat:chatgpt:conversation") return;

    const conversationId = event.data.data?.conversation_id;
    if (typeof conversationId !== "string" || !conversationId) return;

    chrome.runtime.sendMessage({
      type: "openchat:conversation-captured",
      platform: "chatgpt",
      url: `${CHATGPT_ORIGIN}/c/${conversationId}`,
      data: event.data.data,
    });
  });
}

function listenForPaste() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "openchat:paste-chat") {
      sendResponse({ ok: tryPasteChat(message.text) });
    }
  });
}

relayToBackground();
injectInterceptor();
listenForPaste();
