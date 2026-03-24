import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import type {
  OpenChatConversation,
  OpenChatContentBlock,
} from "../../lib/schema/conversation.js";

@customElement("oc-sidepanel")
export class SidePanel extends LitElement {
  static override readonly styles = css`
    :host {
      display: block;
    }

    .header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
    }

    .header h1 {
      font-size: var(--text-lg);
      font-weight: 600;
      margin: 0;
      flex: 1;
    }

    .back-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-1) var(--space-2_5);
      cursor: pointer;
      font-size: var(--text-sm);
      color: var(--text, inherit);
    }

    .back-btn:hover {
      background: var(--bg-secondary);
    }

    .conversation-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .conversation-card {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-3);
      cursor: pointer;
      transition: background 0.15s;
    }

    .conversation-card:hover {
      background: var(--bg-secondary);
    }

    .conversation-title {
      font-weight: 500;
      margin-bottom: var(--space-1);
    }

    .conversation-meta {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      display: flex;
      gap: var(--space-2);
      align-items: center;
    }

    .platform-badge {
      font-size: var(--text-xs);
      font-weight: 600;
      padding: var(--space-0_5) var(--space-1_5);
      border-radius: var(--radius);
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

    .empty-state {
      text-align: center;
      padding: var(--space-12) var(--space-4);
      color: var(--text-secondary);
    }

    .empty-state p {
      margin-top: var(--space-2);
      font-size: var(--text-sm);
    }

    .chat-view {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .message {
      max-width: 85%;
      padding: var(--space-2_5) var(--space-3_5);
      border-radius: var(--radius);
      font-size: var(--text-sm);
      line-height: 1.5;
      word-wrap: break-word;
    }

    .message.user {
      align-self: flex-end;
      background: var(--accent);
      color: oklch(98% 0 0);
      border-bottom-right-radius: var(--radius-sm);
    }

    .message.assistant {
      align-self: flex-start;
      background: var(--bg-secondary);
      border-bottom-left-radius: var(--radius-sm);
    }

    .thinking-block {
      font-style: italic;
      opacity: 0.7;
      font-size: var(--text-sm);
      margin-bottom: var(--space-1_5);
      padding-bottom: var(--space-1_5);
      border-bottom: 1px solid var(--border);
    }

    .message pre {
      background: oklch(20% 0.005 286);
      color: oklch(90% 0.005 286);
      padding: var(--space-2_5);
      border-radius: var(--radius);
      overflow-x: auto;
      font-size: var(--text-sm);
      margin: var(--space-1_5) 0;
    }
  `;

  @state()
  private conversations: OpenChatConversation[] = [];

  @state()
  private selectedConversation: OpenChatConversation | null = null;

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

  private selectConversation(conv: OpenChatConversation) {
    this.selectedConversation = conv;
  }

  private goBack() {
    this.selectedConversation = null;
  }

  private renderContentBlock(block: OpenChatContentBlock) {
    switch (block.type) {
      case "thinking":
        return html`<div class="thinking-block">${block.text}</div>`;
      case "text":
        return html`<span>${block.text}</span>`;
      case "code":
        return html`<pre><code>${block.code}</code></pre>`;
      case "tool_use":
        return html`<div class="thinking-block">Used tool: ${block.name}</div>`;
      case "tool_result":
        return html`<div class="thinking-block">
          Tool result: ${block.content}
        </div>`;
      default:
        return html``;
    }
  }

  private renderChatView() {
    const conv = this.selectedConversation!;
    return html`
      <div class="header">
        <button class="back-btn" @click=${this.goBack}>&larr;</button>
        <h1>${conv.title}</h1>
      </div>
      <div class="chat-view">
        ${conv.messages.map(
          (msg) => html`
            <div class="message ${msg.role}">
              ${msg.content.map((block) => this.renderContentBlock(block))}
            </div>
          `
        )}
      </div>
    `;
  }

  private renderConversationList() {
    if (this.conversations.length === 0) {
      return html`
        <div class="header">
          <h1>OpenChat</h1>
        </div>
        <div class="empty-state">
          <p>No conversations captured yet.</p>
          <p>Visit Claude or ChatGPT and start chatting.</p>
        </div>
      `;
    }

    return html`
      <div class="header">
        <h1>OpenChat</h1>
      </div>
      <div class="conversation-list">
        ${this.conversations.map(
          (conv) => html`
            <div
              class="conversation-card"
              @click=${() => this.selectConversation(conv)}
            >
              <div class="conversation-title">${conv.title}</div>
              <div class="conversation-meta">
                <span class="platform-badge ${conv.source.platform}">
                  ${conv.source.platform}
                </span>
                <span>${conv.messages.length} messages</span>
                <span>${this.formatDate(conv.updatedAt)}</span>
              </div>
            </div>
          `
        )}
      </div>
    `;
  }

  override render() {
    return this.selectedConversation
      ? this.renderChatView()
      : this.renderConversationList();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "oc-sidepanel": SidePanel;
  }
}
