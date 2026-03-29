import {
  parseClaudeConversation,
  type ClaudeConversationResponse,
} from "./lib/parsers/claude.js";
import {
  parseChatGPTConversation,
  type ChatGPTConversationResponse,
} from "./lib/parsers/chatgpt.js";
import type {
  OpenChatConversation,
  OpenChatPlatform,
} from "./lib/schema/conversation.js";
import {
  upsertConversation,
  getAllConversations,
  getConversation,
} from "./lib/storage/db.js";

const OPENCHAT_REF_REGEX = /\[openchat:ref:([^\]]+)\]/;

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

function extractSourceRef(platform: string, data: unknown): string | null {
  if (platform === "claude") {
    return extractRefFromClaudeData(data as ClaudeConversationResponse);
  }
  if (platform === "chatgpt") {
    return extractRefFromChatGPTData(data as ChatGPTConversationResponse);
  }
  return null;
}

function extractRefFromClaudeData(
  data: ClaudeConversationResponse
): string | null {
  for (const msg of data.chat_messages) {
    if (msg.sender === "human") {
      const match = msg.text.match(OPENCHAT_REF_REGEX);
      if (match) return match[1];
    }
  }
  return null;
}

function extractRefFromChatGPTData(
  data: ChatGPTConversationResponse
): string | null {
  for (const node of Object.values(data.mapping)) {
    if (node.message?.author?.role === "user") {
      const text = extractTextFromChatGPTNode(node);
      const match = text.match(OPENCHAT_REF_REGEX);
      if (match) return match[1];
    }
  }
  return null;
}

type ChatGPTNode = {
  message?: {
    content?: {
      parts?: unknown[];
      text?: string;
    } | null;
  } | null;
};

function extractTextFromChatGPTNode(node: ChatGPTNode): string {
  const content = node.message?.content;
  if (!content) return "";

  if (Array.isArray(content.parts)) {
    return content.parts
      .flatMap((p) =>
        typeof p === "string"
          ? [p]
          : typeof p === "object" && p !== null && "text" in p
          ? [String((p as { text: unknown }).text)]
          : []
      )
      .join("\n");
  }

  if (typeof content.text === "string") {
    return content.text;
  }

  return "";
}

async function handleCapturedConversation(message: {
  platform: string;
  url: string;
  data: unknown;
}) {
  try {
    let conversation: OpenChatConversation;

    if (message.platform === "claude") {
      conversation = parseClaudeConversation(
        message.data as Parameters<typeof parseClaudeConversation>[0],
        message.url
      );
    } else if (message.platform === "chatgpt") {
      conversation = parseChatGPTConversation(
        message.data as Parameters<typeof parseChatGPTConversation>[0],
        message.url
      );
    } else {
      return;
    }

    const sourceConvId = extractSourceRef(message.platform, message.data);

    if (sourceConvId) {
      const existing = await getConversation(sourceConvId);
      if (existing) {
        await mergeConversations(existing, conversation);
        return;
      }
      console.log(`[OpenChat] Source conversation not found: ${sourceConvId}`);
    }

    await handleSavedConversation(conversation);
  } catch (err) {
    console.error("[OpenChat] Failed to save conversation:", err);
  }
}

async function mergeConversations(
  existing: OpenChatConversation,
  newPortion: OpenChatConversation
): Promise<void> {
  const lastMessage = existing.messages[existing.messages.length - 1];
  const previousPlatform = existing.source.platform as OpenChatPlatform;

  const merged: OpenChatConversation = {
    ...existing,
    updatedAt: newPortion.updatedAt,
    source: {
      ...existing.source,
      platform: newPortion.source.platform,
      conversationId: newPortion.source.conversationId,
      url: newPortion.source.url,
      model: newPortion.source.model,
      previousConversations: [
        ...(existing.source.previousConversations ?? []),
        {
          platform: previousPlatform,
          conversationId: existing.source.conversationId,
        },
      ],
    },
    metadata: {
      ...existing.metadata,
      providerChanged: true,
      lastProviderChange: {
        from: previousPlatform,
        to: newPortion.source.platform,
        at: newPortion.updatedAt,
      },
    },
    messages: [
      ...existing.messages,
      ...newPortion.messages.map((msg, idx) => ({
        ...msg,
        id: crypto.randomUUID(),
        parentId: idx === 0 && lastMessage ? lastMessage.id : undefined,
        metadata: {
          ...msg.metadata,
          originalPlatform: newPortion.source.platform as OpenChatPlatform,
        },
      })),
    ],
  };

  await upsertConversation(merged);

  console.log(
    `[OpenChat] Merged conversation: "${existing.title}" (${previousPlatform} → ${newPortion.source.platform})`
  );

  await Promise.allSettled([
    notifyConversationUpdated(),
    upsertConversationInBridge(merged),
  ]);
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
