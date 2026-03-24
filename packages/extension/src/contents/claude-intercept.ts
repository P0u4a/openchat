/**
 * This function runs in the actual page context.
 * Monkey-patches window.fetch to capture Claude conversation API responses.
 * Captured data is relayed via window.postMessage.
 *
 */
export function claudeFetchIntercept(origin: string) {
  const origFetch = window.fetch;

  window.fetch = async function (...args: Parameters<typeof fetch>) {
    const response = await origFetch.apply(this, args);

    const url =
      typeof args[0] === "string"
        ? args[0]
        : args[0] instanceof Request
          ? args[0].url
          : String(args[0]);

    const isConversationGet =
      /\/api\/organizations\/[^/]+\/chat_conversations\/[^/?]+/.test(url) &&
      !url.includes("/completion") &&
      !url.includes("/title");

    if (isConversationGet && response.ok) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (data?.chat_messages) {
          window.postMessage(
            {
              type: "openchat:claude:conversation",
              url,
              data,
            },
            origin
          );
        }
      } catch {
        // ignore parse errors
      }
    }

    return response;
  };
}
