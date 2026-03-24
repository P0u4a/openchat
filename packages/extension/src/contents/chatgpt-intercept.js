/**
 * This file runs in the actual page context as an injected script.
 * Monkey-patches window.fetch to capture ChatGPT conversation API responses.
 */

const origin = document.currentScript?.dataset.origin ?? location.origin;

const browserFetch = window.fetch;
const snapshotFetches = new Map();
const capturedConversationIds = new Set();
let latestConversationHeaders = [];

function normalizeUrl(input) {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : String(input);

  return new URL(raw, location.origin).href;
}

function getConversationIdFromSnapshotUrl(url) {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/^\/backend-api\/conversation\/([^/]+)$/);
  return match?.[1] ?? null;
}

function isConversationSnapshotGet(method, url) {
  return method === "GET" && getConversationIdFromSnapshotUrl(url) !== null;
}

function isConversationStream(method, url) {
  if (method !== "POST") return false;
  const pathname = new URL(url).pathname;
  return (
    pathname === "/backend-api/f/conversation" ||
    pathname === "/backend-api/f/conversation/resume"
  );
}

function isConversationResumeStream(method, url) {
  if (method !== "POST") return false;
  return new URL(url).pathname === "/backend-api/f/conversation/resume";
}

function isBackendApiRequest(url) {
  return new URL(url).pathname.startsWith("/backend-api/");
}

function parseConversationIdFromStream(text) {
  const matches = [...text.matchAll(/"conversation_id"\s*:\s*"([^"]+)"/g)];
  return matches[0]?.[1] ?? null;
}

function getConversationIdFromPageUrl() {
  const match = location.pathname.match(/^\/c\/([^/]+)$/);
  return match?.[1] ?? null;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForConversationRoute(conversationId, timeoutMs = 3000) {
  if (getConversationIdFromPageUrl() === conversationId) {
    return true;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(100);
    if (getConversationIdFromPageUrl() === conversationId) {
      return true;
    }
  }

  return false;
}

async function waitForAnyConversationRoute(timeoutMs = 3000) {
  const currentConversationId = getConversationIdFromPageUrl();
  if (currentConversationId) {
    return currentConversationId;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(100);
    const conversationId = getConversationIdFromPageUrl();
    if (conversationId) {
      return conversationId;
    }
  }

  return null;
}

function decodeMaybeBase64Json(value) {
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(atob(value));
    } catch {
      return null;
    }
  }
}

function extractRequestHeaders(request, init) {
  try {
    const sourceHeaders =
      init?.headers ??
      (request instanceof Request ? request.headers : undefined) ??
      undefined;

    if (!sourceHeaders) return [];
    return Array.from(new Headers(sourceHeaders).entries());
  } catch {
    return [];
  }
}

function buildSnapshotHeaders(rawHeaders, conversationId) {
  const headers = new Headers();
  const snapshotPath = `/backend-api/conversation/${conversationId}`;

  for (const [name, value] of rawHeaders) {
    const lower = name.toLowerCase();
    if (!value) continue;

    if (
      lower === "accept" ||
      lower === "content-length" ||
      lower === "content-type" ||
      lower === "cookie" ||
      lower === "host" ||
      lower === "origin" ||
      lower === "priority" ||
      lower === "referer" ||
      lower === "user-agent" ||
      lower.startsWith("sec-")
    ) {
      continue;
    }

    headers.set(name, value);
  }

  headers.set("accept", "application/json");
  headers.set("x-openai-target-path", snapshotPath);
  headers.set("x-openai-target-route", "/backend-api/conversation/{conversation_id}");

  return headers;
}

async function readSnapshotPayload(response) {
  try {
    return await response.json();
  } catch {
    try {
      const text = await response.text();
      return decodeMaybeBase64Json(text);
    } catch {
      return null;
    }
  }
}

function postConversation(data) {
  if (!data?.mapping || !data?.conversation_id) return;
  capturedConversationIds.add(data.conversation_id);

  window.postMessage(
    {
      type: "openchat:chatgpt:conversation",
      data,
    },
    origin
  );
}

async function captureSnapshot(response) {
  const data = await readSnapshotPayload(response);
  postConversation(data);
}

async function fetchSnapshot(conversationId, rawHeaders = latestConversationHeaders) {
  if (!conversationId || capturedConversationIds.has(conversationId)) return;
  if (snapshotFetches.has(conversationId)) {
    return snapshotFetches.get(conversationId);
  }

  const snapshotUrl = `${origin}/backend-api/conversation/${conversationId}`;
  const conversationUrl = `${origin}/c/${conversationId}`;
  const promise = (async () => {
    await waitForConversationRoute(conversationId);

    const retrysleepsMs = [0, 250, 500, 1000, 2000, 3000];
    let lastFailure = "unknown";

    for (const retrysleepMs of retrysleepsMs) {
      if (retrysleepMs > 0) {
        await sleep(retrysleepMs);
      }

      const snapshotHeaders =
        rawHeaders.length > 0 ? rawHeaders : latestConversationHeaders;
      const response = await browserFetch(snapshotUrl, {
        credentials: "same-origin",
        headers: buildSnapshotHeaders(snapshotHeaders, conversationId),
        referrer: conversationUrl,
        referrerPolicy: "strict-origin-when-cross-origin",
      }).catch(() => null);

      if (!response) {
        lastFailure = "network";
        continue;
      }

      if (!response.ok) {
        lastFailure = String(response.status);
        continue;
      }

      const data = await readSnapshotPayload(response);
      if (!data?.mapping || !data?.conversation_id) {
        lastFailure = "invalid-payload";
        continue;
      }

      postConversation(data);
      return;
    }

    console.warn("[OpenChat] ChatGPT snapshot fetch failed", {
      conversationId,
      reason: lastFailure,
    });
  })()
    .finally(() => {
      snapshotFetches.delete(conversationId);
    });

  snapshotFetches.set(conversationId, promise);
  return promise;
}

function captureSnapshotInBackground(response) {
  void captureSnapshot(response).catch(() => {
    // ignore parse errors
  });
}

function processConversationStreamInBackground(response, method, url) {
  return (rawHeaders) =>
    void (async () => {
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        return;
      }

      let conversationId = null;
      if (isConversationResumeStream(method, url)) {
        conversationId =
          getConversationIdFromPageUrl() ?? (await waitForAnyConversationRoute());
      } else {
        try {
          const text = await response.text();
          conversationId = parseConversationIdFromStream(text);
        } catch {
          // Transport errors can happen before the stream fully closes.
        }
      }

      if (!conversationId) {
        conversationId = await waitForAnyConversationRoute();
      }

      if (conversationId) {
        await fetchSnapshot(conversationId, rawHeaders);
      }
    })().catch(() => {
      // ignore parse errors
    });
}

window.fetch = async function (...args) {
  const response = await browserFetch.apply(this, args);

  const request = args[0];
  const method =
    args[1]?.method ??
    (request instanceof Request ? request.method : undefined) ??
    "GET";
  const url = normalizeUrl(request);
  const requestHeaders = extractRequestHeaders(request, args[1]);
  if (requestHeaders.length > 0 && isBackendApiRequest(url)) {
    latestConversationHeaders = requestHeaders;
  }

  if (isConversationSnapshotGet(method, url) && response.ok) {
    captureSnapshotInBackground(response.clone());
    return response;
  }

  if (isConversationStream(method, url) && response.ok) {
    processConversationStreamInBackground(response.clone(), method, url)(
      requestHeaders
    );
  }

  return response;
};
