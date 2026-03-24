import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { OpenChatConversation } from "../../lib/schema/conversation.js";

@customElement("oc-sidepanel")
export class SidePanel extends LitElement {
  static override readonly styles = css`
    :host {
      display: block;
      padding: 16px;
    }

    h1 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
    }

    .conversation-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .conversation-card {
      border: 1px solid var(--border, oklch(85% 0.003 286));
      border-radius: 0.375rem;
      padding: 12px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .conversation-card:hover {
      background: var(--bg-secondary, oklch(92% 0.002 286));
    }

    .conversation-title {
      font-weight: 500;
      margin-bottom: 4px;
    }

    .conversation-meta {
      font-size: 12px;
      color: var(--text-secondary, oklch(45% 0.005 286));
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .platform-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 0.375rem;
      text-transform: uppercase;
    }

    .platform-badge.claude {
      background: oklch(90% 0.08 65);
      color: oklch(35% 0.1 65);
    }

    .platform-badge.chatgpt {
      background: oklch(90% 0.08 165);
      color: oklch(30% 0.1 165);
    }

    .message-count {
      font-size: 12px;
      color: var(--text-secondary, oklch(45% 0.005 286));
    }

    .empty-state {
      text-align: center;
      padding: 48px 16px;
      color: var(--text-secondary, oklch(45% 0.005 286));
    }

    .empty-state p {
      margin-top: 8px;
      font-size: 13px;
    }
  `;

  @state()
  private conversations: OpenChatConversation[] = [];

  override connectedCallback() {
    super.connectedCallback();
    this.loadConversations();

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "openchat:conversation-updated") {
        this.loadConversations();
      }
    });
  }

  private async loadConversations() {
    const response = await chrome.runtime.sendMessage({
      type: "openchat:get-conversations",
    });
    if (response?.conversations) {
      this.conversations = response.conversations;
    }
  }

  private formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  override render() {
    return html`
      <h1>OpenChat</h1>

      ${this.conversations.length === 0
        ? html`
            <div class="empty-state">
              <p>No conversations captured yet.</p>
              <p>Visit Claude or ChatGPT and start chatting.</p>
            </div>
          `
        : html`
            <div class="conversation-list">
              ${this.conversations.map(
                (conv) => html`
                  <div class="conversation-card">
                    <div class="conversation-title">${conv.title}</div>
                    <div class="conversation-meta">
                      <span class="platform-badge ${conv.source.platform}">
                        ${conv.source.platform}
                      </span>
                      <span class="message-count">
                        ${conv.messages.length} messages
                      </span>
                      <span>${this.formatDate(conv.updatedAt)}</span>
                    </div>
                  </div>
                `
              )}
            </div>
          `}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "oc-sidepanel": SidePanel;
  }
}
