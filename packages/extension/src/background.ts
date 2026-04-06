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
  OpenChatBranchEntry,
} from "./lib/schema/conversation.js";
import {
  upsertConversation,
  getAllConversations,
  getConversation,
} from "./lib/storage/db.js";

import {
  formatConversationMarkdown,
  stripOpenChatRef,
} from "./utils/conversation-markdown.js";

const OPENCHAT_REF_REGEX = /\[openchat:ref:([^\]:]+)(?::([^\]]+))?\]/;

type SourceRef = {
  conversationId: string;
  lastMessageId: string | null;
};

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

  if (message.type === "openchat:get-conversation") {
    getConversation(message.id).then((conversation) => {
      sendResponse({ conversation: conversation ?? null });
    });
    return true;
  }
});

function extractSourceRef(platform: string, data: unknown): SourceRef | null {
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
): SourceRef | null {
  for (const msg of data.chat_messages) {
    if (msg.sender === "human") {
      const match = msg.text.match(OPENCHAT_REF_REGEX);
      if (match)
        return { conversationId: match[1], lastMessageId: match[2] ?? null };
    }
  }
  return null;
}

function extractRefFromChatGPTData(
  data: ChatGPTConversationResponse
): SourceRef | null {
  for (const node of Object.values(data.mapping)) {
    if (node.message?.author?.role === "user") {
      const text = extractTextFromChatGPTNode(node);
      const match = text.match(OPENCHAT_REF_REGEX);
      if (match)
        return { conversationId: match[1], lastMessageId: match[2] ?? null };
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

type ForkDecision =
  | { type: "continue" }
  | { type: "fork"; branchPointMessageId: string };

function detectForkOrContinuation(
  existing: OpenChatConversation,
  lastMessageId: string | null
): ForkDecision {
  if (!lastMessageId) return { type: "continue" };

  const lastMsg = existing.messages[existing.messages.length - 1];
  if (lastMsg?.id === lastMessageId) return { type: "continue" };

  const found = existing.messages.some((msg) => msg.id === lastMessageId);
  if (found) return { type: "fork", branchPointMessageId: lastMessageId };

  // Message ID not found, treat as continuation
  return { type: "continue" };
}

/**
 * Strip the pasted conversation content from the first user message,
 * preserving any additional text the user typed after the paste.
 */
function stripPastedContent(
  messages: OpenChatConversation["messages"],
  sourceConversation: OpenChatConversation,
  branchPointMessageId: string | null
): OpenChatConversation["messages"] {
  // Find the first user message (the paste message)
  const pasteIdx = messages.findIndex((m) => m.role === "user");
  if (pasteIdx === -1) return messages;

  const pasteMsg = messages[pasteIdx];
  const pasteText = pasteMsg.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n\n");

  // Generate expected pasted markdown (up to branch point)
  let sourceMessages = sourceConversation.messages;
  if (branchPointMessageId) {
    const bpIdx = sourceMessages.findIndex(
      (m) => m.id === branchPointMessageId
    );
    if (bpIdx !== -1) {
      sourceMessages = sourceMessages.slice(0, bpIdx + 1);
    }
  }
  const sourceForComparison: OpenChatConversation = {
    ...sourceConversation,
    messages: sourceMessages,
  };
  const expectedMarkdown = formatConversationMarkdown(
    sourceForComparison,
    false
  );

  // Strip the ref first, then check if the content starts with the expected markdown
  const strippedText = stripOpenChatRef(pasteText);
  const remainder = strippedText.startsWith(expectedMarkdown)
    ? strippedText.slice(expectedMarkdown.length).trim()
    : strippedText;

  if (!remainder) {
    // No extra content so drop the paste message entirely
    return [...messages.slice(0, pasteIdx), ...messages.slice(pasteIdx + 1)];
  }

  // Replace the paste message content with only the extra text
  const updatedMsg = {
    ...pasteMsg,
    content: [{ type: "text" as const, text: remainder }],
  };
  return [
    ...messages.slice(0, pasteIdx),
    updatedMsg,
    ...messages.slice(pasteIdx + 1),
  ];
}

async function branchConversation(
  existing: OpenChatConversation,
  newPortion: OpenChatConversation,
  branchPointMessageId: string
): Promise<void> {
  // Copy messages from source up to and including the branch point
  const bpIdx = existing.messages.findIndex(
    (m) => m.id === branchPointMessageId
  );
  const sourceMessages =
    bpIdx !== -1 ? existing.messages.slice(0, bpIdx + 1) : existing.messages;

  const lastSourceMsg = sourceMessages[sourceMessages.length - 1];

  // Strip the pasted content from new messages
  const dedupedNewMessages = stripPastedContent(
    newPortion.messages,
    existing,
    branchPointMessageId
  );

  const branchId = crypto.randomUUID();

  const branch: OpenChatConversation = {
    id: branchId,
    title: newPortion.title,
    createdAt: newPortion.createdAt,
    updatedAt: newPortion.updatedAt,
    source: {
      platform: newPortion.source.platform,
      conversationId: newPortion.source.conversationId,
      url: newPortion.source.url,
      model: newPortion.source.model,
    },
    messages: [
      ...sourceMessages.map((msg) => ({
        ...msg,
        metadata: {
          ...msg.metadata,
          originalPlatform: msg.metadata?.originalPlatform ?? existing.source.platform,
        },
      })),
      ...dedupedNewMessages.map((msg, idx) => ({
        ...msg,
        id: crypto.randomUUID(),
        parentId: idx === 0 && lastSourceMsg ? lastSourceMsg.id : undefined,
        metadata: {
          ...msg.metadata,
          originalPlatform: newPortion.source.platform as OpenChatPlatform,
        },
      })),
    ],
    metadata: {
      branchInfo: {
        branchedFromId: existing.id,
        branchPointMessageId,
      },
    },
  };

  // Update the source conversation to record the branch
  const branchEntry: OpenChatBranchEntry = {
    conversationId: branchId,
    atMessageId: branchPointMessageId,
    title: newPortion.title,
    createdAt: new Date().toISOString(),
  };

  const existingBranches = existing.metadata?.branchInfo?.branches ?? [];
  const updatedExisting: OpenChatConversation = {
    ...existing,
    metadata: {
      ...existing.metadata,
      branchInfo: {
        ...existing.metadata?.branchInfo,
        branches: [...existingBranches, branchEntry],
      },
    },
  };

  await Promise.all([
    upsertConversation(updatedExisting),
    upsertConversation(branch),
  ]);

  console.log(
    `[OpenChat] Branched conversation: "${existing.title}" → "${newPortion.title}" at message ${branchPointMessageId}`
  );

  await Promise.allSettled([
    notifyConversationUpdated(),
    upsertConversationInBridge(updatedExisting),
    upsertConversationInBridge(branch),
  ]);
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

    const sourceRef = extractSourceRef(message.platform, message.data);

    if (sourceRef) {
      const existing = await getConversation(sourceRef.conversationId);
      if (existing) {
        const action = detectForkOrContinuation(
          existing,
          sourceRef.lastMessageId
        );
        if (action.type === "fork") {
          await branchConversation(
            existing,
            conversation,
            action.branchPointMessageId
          );
        } else {
          await mergeConversations(existing, conversation);
        }
        return;
      }
      console.log(
        `[OpenChat] Source conversation not found: ${sourceRef.conversationId}`
      );
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

  // Strip pasted content from the new messages
  const dedupedNewMessages = stripPastedContent(
    newPortion.messages,
    existing,
    null
  );

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
      ...existing.messages.map((msg) => ({
        ...msg,
        metadata: {
          ...msg.metadata,
          originalPlatform: msg.metadata?.originalPlatform ?? previousPlatform,
        },
      })),
      ...dedupedNewMessages.map((msg, idx) => ({
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
  const messagesWithoutRefs = conversation.messages.map((msg) => {
    if (msg.role !== "user") return msg;
    const strippedContent = msg.content.map((block) => {
      if (block.type !== "text") return block;
      return {
        ...block,
        text: stripOpenChatRef(block.text),
      };
    });
    return { ...msg, content: strippedContent };
  });

  const conversationWithoutRefs = {
    ...conversation,
    messages: messagesWithoutRefs,
  };

  await upsertConversation(conversationWithoutRefs);
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
