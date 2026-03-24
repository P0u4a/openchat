import { parseClaudeConversation } from "./lib/parsers/claude.js";
import { parseChatGPTConversation } from "./lib/parsers/chatgpt.js";
import type { OpenChatConversation } from "./lib/schema/conversation.js";
import { upsertConversation, getAllConversations } from "./lib/storage/db.js";

const OPENCHAT_BRIDGE_ORIGIN = "http://127.0.0.1:27124";
let hasLoggedBridgeFailure = false;

type OpenChatBridgeMessage =
  | {
      type: "sync-conversations";
      conversations: OpenChatConversation[];
    }
  | {
      type: "upsert-conversation";
      conversation: OpenChatConversation;
    };

type OpenChatBridgeResponse = {
  ok?: boolean;
  name?: string;
  error?: string;
};

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
void syncAllConversationsToBridge();

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
      await handleSavedConversation(conversation);
      return;
    }

    if (message.platform === "chatgpt") {
      const conversation = parseChatGPTConversation(
        message.data as Parameters<typeof parseChatGPTConversation>[0],
        message.url
      );
      await handleSavedConversation(conversation);
    }
  } catch (err) {
    console.error("[OpenChat] Failed to save conversation:", err);
  }
}

async function handleSavedConversation(conversation: OpenChatConversation) {
  await upsertConversation(conversation);
  console.log(
    `[OpenChat] Saved ${conversation.source.platform} conversation: "${conversation.title}" (${conversation.messages.length} messages)`
  );

  await Promise.allSettled([
    notifyConversationUpdated(),
    upsertConversationInBridge(conversation),
  ]);
}

async function notifyConversationUpdated() {
  await chrome.runtime
    .sendMessage({
      type: "openchat:conversation-updated",
    })
    .catch(() => {
      // ignore if side panel is closed
    });
}

async function syncAllConversationsToBridge() {
  const conversations = await getAllConversations();
  await sendMessageToBridge("/conversations/sync", {
    type: "sync-conversations",
    conversations,
  });
}

async function upsertConversationInBridge(conversation: OpenChatConversation) {
  await sendMessageToBridge("/conversations/upsert", {
    type: "upsert-conversation",
    conversation,
  });
}

async function sendMessageToBridge(
  pathname: "/conversations/sync" | "/conversations/upsert",
  message: OpenChatBridgeMessage
) {
  try {
    const response = await fetch(`${OPENCHAT_BRIDGE_ORIGIN}${pathname}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(message),
    });

    let payload: OpenChatBridgeResponse | undefined;

    try {
      payload = (await response.json()) as OpenChatBridgeResponse;
    } catch {
      payload = undefined;
    }

    if (!response.ok || payload?.ok === false || payload?.name !== "openchat") {
      console.warn("[OpenChat] OpenChat bridge returned an error:", {
        status: response.status,
        payload,
      });
    }
  } catch (error) {
    if (!hasLoggedBridgeFailure) {
      hasLoggedBridgeFailure = true;
      console.warn(
        "[OpenChat] OpenChat bridge unavailable. Run the openchat MCP server to sync conversations into the shared store.",
        error
      );
    }
  }
}
