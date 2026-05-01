import { LitElement, html, css, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export type DropdownItem = {
  icon: TemplateResult<1>;
  name: string;
  action: () => void;
};

export const dropdownMenuStyles = css`
  oc-dropdown-menu {
    position: relative;
    display: inline-block;
  }

  oc-dropdown-menu .dropdown-trigger {
    display: contents;
  }

  oc-dropdown-menu .dropdown-menu {
    position: absolute;
    bottom: calc(100% + var(--space-1));
    left: 100%;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 11rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-1);
    box-shadow: 0 4px 12px oklch(0% 0 0 / 0.15);
  }

  oc-dropdown-menu .dropdown-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: none;
    border: none;
    border-radius: var(--radius);
    padding: var(--space-1_5) var(--space-2_5);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--text-sm);
    color: var(--text);
    text-align: left;
    white-space: nowrap;
  }

  oc-dropdown-menu .dropdown-item:hover {
    background: var(--bg-secondary);
  }

  oc-dropdown-menu .dropdown-item-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  oc-dropdown-menu .dropdown-item-icon svg {
    width: 12px;
    height: 12px;
  }
`;

@customElement("oc-dropdown-menu")
export class DropdownMenu extends LitElement {
  override createRenderRoot() {
    return this;
  }

  @property({ attribute: false })
  items: DropdownItem[] = [];

  @property({ attribute: false })
  trigger!: TemplateResult<1>;

  @state()
  private open = false;

  private readonly closeOnDocClick = () => {
    if (this.open) this.open = false;
  };

  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener("click", this.closeOnDocClick);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("click", this.closeOnDocClick);
  }

  private toggle(e: Event) {
    e.stopPropagation();
    this.open = !this.open;
  }

  private select(item: DropdownItem, e: Event) {
    e.stopPropagation();
    this.open = false;
    item.action();
  }

  override render() {
    return html`
      <div class="dropdown-trigger" @click=${this.toggle}>${this.trigger}</div>
      ${this.open
        ? html`
            <div
              class="dropdown-menu"
              role="menu"
              @click=${(e: Event) => e.stopPropagation()}
            >
              ${this.items.map(
                (item) => html`
                  <button
                    class="dropdown-item"
                    role="menuitem"
                    @click=${(e: Event) => this.select(item, e)}
                  >
                    <span class="dropdown-item-icon">${item.icon}</span>
                    ${item.name}
                  </button>
                `
              )}
            </div>
          `
        : ""}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "oc-dropdown-menu": DropdownMenu;
  }
}
