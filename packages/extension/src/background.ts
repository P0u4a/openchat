import { parseClaudeConversation } from "./lib/parsers/claude.js";
import { parseChatGPTConversation } from "./lib/parsers/chatgpt.js";
import { upsertConversation, getAllConversations } from "./lib/storage/db.js";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "openchat:conversation-captured") {
    handleCapturedConversation(message).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "openchat:get-conversations") {
    getAllConversations().then((conversations) => {
      sendResponse({ conversations });
    });
    return true;
  }
});

async function handleCapturedConversation(message: {
  platform: string;
  url: string;
  data: unknown;
}) {
  try {
    if (message.platform === "claude") {
      const conversation = parseClaudeConversation(
        message.data as Parameters<typeof parseClaudeConversation>[0],
        message.url
      );
      await upsertConversation(conversation);
      console.log(
        `[OpenChat] Saved Claude conversation: "${conversation.title}" (${conversation.messages.length} messages)`
      );

      // Notify side panel to refresh
      chrome.runtime
        .sendMessage({
          type: "openchat:conversation-updated",
        })
        .catch(() => {
          // ignore if side panel is closed
        });
      return;
    }

    if (message.platform === "chatgpt") {
      const conversation = parseChatGPTConversation(
        message.data as Parameters<typeof parseChatGPTConversation>[0],
        message.url
      );
      await upsertConversation(conversation);
      console.log(
        `[OpenChat] Saved ChatGPT conversation: "${conversation.title}" (${conversation.messages.length} messages)`
      );

      chrome.runtime
        .sendMessage({
          type: "openchat:conversation-updated",
        })
        .catch(() => {
          // ignore if side panel is closed
        });
    }
  } catch (err) {
    console.error("[OpenChat] Failed to save conversation:", err);
  }
}
