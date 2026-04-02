import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { until } from "lit/directives/until.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { backArrow } from "./icons/back-arrow.js";
import { claudeIcon } from "./icons/claude-icon.js";
import { chatgptIcon } from "./icons/chatgpt-icon.js";
import { sortLatestIcon } from "./icons/sort-latest.js";
import { sortEarliestIcon } from "./icons/sort-earliest.js";
import type {
  OpenChatConversation,
  OpenChatContentBlock,
  OpenChatMessage,
} from "../../lib/schema/conversation.js";
import { renderMarkdown } from "../../utils/markdown.js";
import {
  formatConversationMarkdown,
  formatMessageMarkdown,
  PASTE_REPLY_LABEL,
} from "../../utils/conversation-markdown.js";
import { pasteIcon } from "./icons/paste-icon.js";
import { downloadIcon } from "./icons/download-icon.js";
import { isSupportedPage } from "../../utils/supported-page.js";

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
      font-size: var(--text-base);
      font-weight: 600;
      margin: 0;
      flex: 1;
      text-wrap: pretty;
    }

    .back-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
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

    .filters {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
    }

    .filters > div {
      display: flex;
      flex-direction: row;
      gap: var(--space-2);
    }

    .search-input {
      flex: 1;
      width: 100%;
      padding: var(--space-1_5) var(--space-2_5);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg);
      color: var(--text);
      font-size: var(--text-sm);
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    }

    .search-input:focus {
      border-color: var(--accent);
    }

    .search-input::placeholder {
      color: var(--text-secondary);
    }

    select {
      appearance: base-select;
      padding: var(--space-1_5) var(--space-2_5);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg);
      color: var(--text);
      font-size: var(--text-sm);
      font-family: inherit;
      cursor: pointer;
      outline: none;
      transition: border-color 0.15s;
    }

    select:focus {
      border-color: var(--accent);
    }

    select::picker(select) {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--bg);
      padding: var(--space-1);
    }

    select option {
      padding: var(--space-1_5) var(--space-2_5);
      border-radius: var(--radius);
      color: var(--text);
      font-size: var(--text-sm);
    }

    select option:hover {
      background: var(--bg-secondary);
    }

    select option:checked {
      background: var(--accent);
      color: oklch(98% 0 0);
    }

    .sort-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-1_5) var(--space-2_5);
      cursor: pointer;
      font-size: var(--text-sm);
      font-family: inherit;
      color: var(--text);
      white-space: nowrap;
      transition: border-color 0.15s;
    }

    .sort-btn:hover {
      background: var(--bg-secondary);
    }

    .conversation-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
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
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--text-xs);
      font-weight: 600;
      padding: var(--space-0_5) var(--space-1_5);
      border-radius: var(--radius);
      text-transform: uppercase;
      background: var(--bg-secondary);
    }

    .platform-badge.claude {
      color: var(--claude-color);
    }

    .platform-badge.chatgpt {
      color: var(--chatgpt-color);
    }

    .platform-icon-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
    }

    .platform-icon-wrap.chatgpt {
      background: oklch(100% 0 0);
      border-radius: 999px;
      padding: 2px;
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
      padding: var(--space-1_5) var(--space-2_5);
      border-radius: var(--radius);
      font-size: var(--text-sm);
      line-height: 1.5;
      word-wrap: break-word;
    }

    .message.user {
      align-self: flex-end;
      background: var(--bg-secondary);
      color: oklch(98% 0 0);
      border-bottom-right-radius: var(--radius-sm);
    }

    .message.assistant {
      align-self: flex-start;
      background: transparent;
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

    .paste-btn {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      gap: var(--space-1);
      background: none;
      border: none;
      border-radius: var(--radius);
      padding: var(--space-1_5) var(--space-2_5);
      cursor: pointer;
      font-size: var(--text-xs);
      font-family: inherit;
      color: var(--text);
      transition: background 0.15s;
    }

    .paste-btn:hover:not(:disabled) {
      background: var(--bg-secondary);
    }

    .paste-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .paste-btn svg {
      flex-shrink: 0;
    }

    .conversation-card-row {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .message-footer {
      margin-top: var(--space-1_5);
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

    .message .reply-label {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      margin-bottom: var(--space-1);
      white-space: pre-line;
    }

    .message .reply-snippet {
      font-size: var(--text-2xs, 0.65rem);
      color: var(--text-secondary);
      font-style: italic;
    }

    .provider-change-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--text-xs);
      color: var(--text-secondary);
      margin-top: var(--space-1);
    }

    .provider-switch-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-2) 0;
      font-size: var(--text-xs);
      color: var(--text-secondary);
      border-top: 1px dashed var(--border);
      border-bottom: 1px dashed var(--border);
      margin: var(--space-2) 0;
    }

    .message.assistant[data-platform="chatgpt"] {
      border-left: 2px solid var(--chatgpt-color);
      padding-left: calc(var(--space-2_5) - 2px);
    }

    .message.assistant[data-platform="claude"] {
      border-left: 2px solid var(--claude-color);
      padding-left: calc(var(--space-2_5) - 2px);
    }

    .branch-banner {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      padding: var(--space-2) var(--space-2_5);
      margin-bottom: var(--space-2);
      border: 1px dashed var(--border);
      border-radius: var(--radius);
    }

    .branch-indicator {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      padding: var(--space-1_5) 0;
      border-left: 2px dashed var(--border);
      padding-left: var(--space-2_5);
      margin: var(--space-1) 0;
    }

    .branch-link {
      color: var(--accent);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .branch-link:hover {
      opacity: 0.8;
    }
  `;

  @state()
  private conversations: OpenChatConversation[] = [];

  @state()
  private selectedConversation: OpenChatConversation | null = null;

  @state()
  private searchQuery = "";

  @state()
  private platformFilter: "all" | "claude" | "chatgpt" = "all";

  @state()
  private sortOrder: "latest" | "earliest" = "latest";

  @state()
  private activeTabId: number | null = null;

  @state()
  private isOnSupportedPage = false;

  @state()
  private branchSourceTitle: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.loadConversations();
    this.updateActiveTab();

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "openchat:conversation-updated") {
        this.loadConversations();
      }
    });

    chrome.tabs.onActivated.addListener(() => this.updateActiveTab());
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
      if (changeInfo.url) this.updateActiveTab();
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

  private get filteredConversations() {
    let result = this.conversations;

    if (this.platformFilter !== "all") {
      result = result.filter((c) => c.source.platform === this.platformFilter);
    }

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter((c) => c.title.toLowerCase().includes(q));
    }

    if (this.sortOrder === "earliest") {
      result = [...result].reverse();
    }

    return result;
  }

  private toggleSortOrder() {
    this.sortOrder = this.sortOrder === "latest" ? "earliest" : "latest";
  }

  private onSearchInput(e: Event) {
    this.searchQuery = (e.target as HTMLInputElement).value;
  }

  private onPlatformChange(e: Event) {
    this.platformFilter = (e.target as HTMLSelectElement)
      .value as typeof this.platformFilter;
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

  private async updateActiveTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (tab?.id && tab.url) {
      this.activeTabId = tab.id;
      this.isOnSupportedPage = isSupportedPage(tab.url);
    } else {
      this.activeTabId = null;
      this.isOnSupportedPage = false;
    }
  }

  private async pasteToChat(text: string) {
    if (!this.activeTabId || !this.isOnSupportedPage) return;
    await chrome.tabs.sendMessage(this.activeTabId, {
      type: "openchat:paste-chat",
      text,
    });
  }

  private pasteConversation(e: Event, conv: OpenChatConversation) {
    e.stopPropagation();
    const lastMsgId = conv.messages.at(-1)?.id;
    this.pasteToChat(formatConversationMarkdown(conv, true, lastMsgId));
  }

  private pasteMessage(msg: OpenChatMessage, convId: string) {
    const conv = this.selectedConversation;
    const lastMsgId = conv?.messages.at(-1)?.id;
    this.pasteToChat(formatMessageMarkdown(msg, convId, lastMsgId));
  }

  private downloadJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private exportConversation(e: Event, conv: OpenChatConversation) {
    e.stopPropagation();
    const slug = conv.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
    this.downloadJson(conv, `openchat-${slug}.json`);
  }

  private exportAllConversations() {
    this.downloadJson(this.conversations, "openchat-conversations.json");
  }

  private selectConversation(conv: OpenChatConversation) {
    this.selectedConversation = conv;
    this.branchSourceTitle = null;
    if (conv.metadata?.branchInfo?.branchedFromId) {
      this.fetchBranchSourceTitle(conv.metadata.branchInfo.branchedFromId);
    }
  }

  private goBack() {
    this.selectedConversation = null;
    this.branchSourceTitle = null;
  }

  private async navigateToBranch(conversationId: string) {
    const response = await chrome.runtime.sendMessage({
      type: "openchat:get-conversation",
      id: conversationId,
    });
    if (response?.conversation) {
      this.selectConversation(response.conversation);
    }
  }

  private async fetchBranchSourceTitle(conversationId: string) {
    const response = await chrome.runtime.sendMessage({
      type: "openchat:get-conversation",
      id: conversationId,
    });
    if (response?.conversation) {
      this.branchSourceTitle = response.conversation.title;
    }
  }

  private renderContentBlock(block: OpenChatContentBlock) {
    switch (block.type) {
      case "thinking":
        return html`<div class="thinking-block">${block.text}</div>`;
      case "text":
        if (block.text.startsWith(PASTE_REPLY_LABEL)) {
          const restText = block.text.slice(PASTE_REPLY_LABEL.length);
          return html`
            <div class="reply-label">${PASTE_REPLY_LABEL}</div>
            <div class="reply-snippet">
              ${until(
                renderMarkdown(restText).then(
                  (content) => html`<span>${unsafeHTML(content)}</span>`
                ),
                html`<span>${restText}</span>`
              )}
            </div>
          `;
        }
        return until(
          renderMarkdown(block.text).then(
            (content) => html`<span>${unsafeHTML(content)}</span>`
          ),
          html`<span>${block.text}</span>`
        );
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
    const messages = conv.messages;
    const branchInfo = conv.metadata?.branchInfo;
    const branches = branchInfo?.branches ?? [];

    return html`
      <div class="header">
        <button class="back-btn" @click=${this.goBack}>${backArrow}</button>
        <h1>${conv.title}</h1>
        <button
          class="paste-btn"
          title="Export conversation as JSON"
          @click=${(e: Event) => this.exportConversation(e, conv)}
        >
          ${downloadIcon}
        </button>
      </div>
      ${branchInfo?.branchedFromId
        ? html`
            <div class="branch-banner">
              ↩ Branched from
              <a
                class="branch-link"
                @click=${() =>
                  this.navigateToBranch(branchInfo.branchedFromId!)}
                >${this.branchSourceTitle ?? "source conversation"}</a
              >
            </div>
          `
        : ""}
      <div class="chat-view">
        ${messages.map((msg, idx) => {
          const msgPlatform = msg.metadata?.originalPlatform;
          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const prevPlatform = prevMsg?.metadata?.originalPlatform;
          const isProviderSwitch =
            prevPlatform && msgPlatform && prevPlatform !== msgPlatform;
          const branchesAtMsg = branches.filter(
            (b) => b.atMessageId === msg.id
          );

          return html`
            ${isProviderSwitch
              ? html`
                  <div class="provider-switch-indicator">
                    ↔ Switched from ${prevPlatform} to ${msgPlatform}
                  </div>
                `
              : ""}
            <div
              class="message ${msg.role}"
              data-platform="${msgPlatform ?? conv.source.platform}"
            >
              ${msg.content.map((block) => this.renderContentBlock(block))}
              ${msg.role === "assistant"
                ? html`
                    <div class="message-footer">
                      <button
                        class="paste-btn"
                        ?disabled=${!this.isOnSupportedPage}
                        title="Paste message into chat"
                        @click=${() => this.pasteMessage(msg, conv.id)}
                      >
                        ${pasteIcon}
                      </button>
                    </div>
                  `
                : ""}
            </div>
            ${branchesAtMsg.map(
              (branch) => html`
                <div class="branch-indicator">
                  ↪ Branched into
                  <a
                    class="branch-link"
                    @click=${() => this.navigateToBranch(branch.conversationId)}
                    >${branch.title}</a
                  >
                </div>
              `
            )}
          `;
        })}
      </div>
    `;
  }

  private renderFilters() {
    return html`
      <div class="filters">
        <search>
          <input
            class="search-input"
            type="search"
            placeholder="Search conversations..."
            .value=${this.searchQuery}
            @input=${this.onSearchInput}
          />
        </search>
        <div>
          <select
            @change=${this.onPlatformChange}
            .value=${this.platformFilter}
          >
            <option value="all">All</option>
            <option value="claude">Claude</option>
            <option value="chatgpt">ChatGPT</option>
          </select>
          <button class="sort-btn" @click=${this.toggleSortOrder}>
            ${this.sortOrder === "latest" ? sortLatestIcon : sortEarliestIcon}
            ${this.sortOrder === "latest" ? "Latest" : "Earliest"}
          </button>
        </div>
      </div>
    `;
  }

  private renderConversationList() {
    return html`
      <div class="header">
        <h1>OpenChat</h1>
        ${this.conversations.length > 0
          ? html`
              <button
                class="paste-btn"
                title="Export all conversations as JSON"
                @click=${this.exportAllConversations}
              >
                ${downloadIcon}
              </button>
            `
          : ""}
      </div>
      ${this.renderFilters()}
      ${this.filteredConversations.length === 0
        ? html`
            <div class="empty-state">
              <p>
                ${this.conversations.length === 0
                  ? "No conversations captured yet."
                  : "No conversations match your filters."}
              </p>
              ${this.conversations.length === 0
                ? html`<p>Visit Claude or ChatGPT and start chatting.</p>`
                : ""}
            </div>
          `
        : html`
            <div class="conversation-list">
              ${this.filteredConversations.map(
                (conv) => html`
                  <div class="conversation-card-row">
                    <div
                      class="conversation-card"
                      @click=${() => this.selectConversation(conv)}
                    >
                      <div class="conversation-title">${conv.title}</div>
                      <div class="conversation-meta">
                        <span class="platform-badge ${conv.source.platform}">
                          ${(conv.metadata?.lastProviderChange?.to ?? conv.source.platform) === "claude"
                            ? claudeIcon
                            : (conv.metadata?.lastProviderChange?.to ?? conv.source.platform) === "chatgpt"
                              ? html`<span class="platform-icon-wrap chatgpt"
                                  >${chatgptIcon}</span
                                >`
                              : ""}
                          ${conv.metadata?.lastProviderChange?.to ?? conv.source.platform}
                        </span>
                        <span>${conv.messages.length} messages</span>
                        <span>${this.formatDate(conv.updatedAt)}</span>
                      </div>
                      ${conv.metadata?.lastProviderChange &&
                      conv.metadata.lastProviderChange.from !==
                        conv.metadata.lastProviderChange.to
                        ? html`
                            <div class="provider-change-badge">
                              ↔ from ${conv.metadata.lastProviderChange.from}
                            </div>
                          `
                        : ""}
                      ${conv.metadata?.branchInfo?.branchedFromId
                        ? html`<div class="provider-change-badge">
                            ↩ branch
                          </div>`
                        : ""}
                      ${(conv.metadata?.branchInfo?.branches?.length ?? 0) > 0
                        ? html`<div class="provider-change-badge">
                            ↪ ${conv.metadata!.branchInfo!.branches!.length}
                            branch${(conv.metadata?.branchInfo?.branches
                              ?.length ?? 0) > 1
                              ? "es"
                              : ""}
                          </div>`
                        : ""}
                    </div>
                    <div style="display:flex;gap:var(--space-2)">
                      <button
                        class="paste-btn"
                        ?disabled=${!this.isOnSupportedPage}
                        title="Paste conversation into chat"
                        @click=${(e: Event) => this.pasteConversation(e, conv)}
                      >
                        ${pasteIcon} Paste
                      </button>
                      <button
                        class="paste-btn"
                        title="Export conversation as JSON"
                        @click=${(e: Event) => this.exportConversation(e, conv)}
                      >
                        ${downloadIcon} Export
                      </button>
                    </div>
                  </div>
                `
              )}
            </div>
          `}
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
