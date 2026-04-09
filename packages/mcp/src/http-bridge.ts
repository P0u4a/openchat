import {
  createServer,
  Server,
  ServerResponse,
  type IncomingMessage,
} from "node:http";
import { bridgeSyncRequestSchema, bridgeUpsertRequestSchema } from "./schema";
import {
  saveConversations,
  upsertConversation,
  withStoreMutation,
} from "./store";

const DEFAULT_BRIDGE_PORT = 27124;
const BRIDGE_HOST = "127.0.0.1";
const MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024;
const BRIDGE_PORT_ENV = "OPENCHAT_BRIDGE_PORT";

export type BridgeOptions = {
  storePath: string;
  port: number;
  onConversationsChanged: () => void;
};

export async function startBridgeServer(
  options: BridgeOptions
): Promise<Server | null> {
  const { storePath, port, onConversationsChanged } = options;

  const server = createServer((request, response) => {
    void handleBridgeRequest(
      request,
      response,
      storePath,
      port,
      onConversationsChanged
    );
  });

  return await new Promise<Server | null>((resolve, reject) => {
    const handleError = (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        process.stderr.write(
          `[openchat] Bridge already active on http://${BRIDGE_HOST}:${port}\n`
        );
        resolve(null);
        return;
      }

      reject(error);
    };

    server.once("error", handleError);
    server.listen(port, BRIDGE_HOST, () => {
      server.off("error", handleError);
      process.stderr.write(
        `[openchat] Bridge listening on http://${BRIDGE_HOST}:${port}\n`
      );
      resolve(server);
    });
  });
}

export async function handleBridgeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  storePath: string,
  port: number,
  onConversationsChanged: () => void
): Promise<void> {
  const corsHeaders = buildCorsHeaders(request);
  const origin = request.headers.origin;

  if (origin && !isAllowedBridgeOrigin(origin)) {
    sendJson(
      response,
      403,
      { ok: false, name: "openchat", error: "Forbidden origin" },
      corsHeaders
    );
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${BRIDGE_HOST}:${port}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(
      response,
      200,
      {
        ok: true,
        name: "openchat",
        transport: "http",
      },
      corsHeaders
    );
    return;
  }

  try {
    if (request.method === "POST" && url.pathname === "/conversations/sync") {
      const payload = bridgeSyncRequestSchema.parse(
        await readJsonBody(request)
      );
      await withStoreMutation(() =>
        saveConversations(storePath, payload.conversations)
      );

      onConversationsChanged();

      sendJson(
        response,
        200,
        {
          ok: true,
          name: "openchat",
          count: payload.conversations.length,
        },
        corsHeaders
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/conversations/upsert") {
      const payload = bridgeUpsertRequestSchema.parse(
        await readJsonBody(request)
      );
      await withStoreMutation(() =>
        upsertConversation(storePath, payload.conversation)
      );

      onConversationsChanged();

      sendJson(
        response,
        200,
        {
          ok: true,
          name: "openchat",
          conversationId: payload.conversation.source.conversationId,
        },
        corsHeaders
      );
      return;
    }

    sendJson(
      response,
      404,
      { ok: false, name: "openchat", error: "Not found" },
      corsHeaders
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode =
      error instanceof Error && error.message.includes("Request body too large")
        ? 413
        : 400;
    sendJson(
      response,
      statusCode,
      { ok: false, name: "openchat", error: message },
      corsHeaders
    );
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.length;

    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      throw new Error("Request body too large");
    }

    chunks.push(bufferChunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(body);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  headers: Record<string, string>
): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...headers,
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body).toString(),
  });
  response.end(body);
}

function buildCorsHeaders(request: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
  const origin = request.headers.origin;

  if (origin && isAllowedBridgeOrigin(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }

  if (request.headers["access-control-request-private-network"] === "true") {
    headers["access-control-allow-private-network"] = "true";
  }

  return headers;
}

function isAllowedBridgeOrigin(origin: string): boolean {
  return origin.startsWith("chrome-extension://");
}

export function resolveBridgePort(argPort?: string): number {
  const envValue = process.env[BRIDGE_PORT_ENV];
  const rawValue = argPort ?? envValue;

  if (!rawValue) {
    return DEFAULT_BRIDGE_PORT;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid OpenChat bridge port: ${rawValue}`);
  }

  return parsed;
}
