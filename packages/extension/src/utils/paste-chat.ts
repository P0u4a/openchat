export function tryPasteChat(text: string): boolean {
  const textbox = document.querySelector<HTMLElement>(
    'div[role="textbox"][contenteditable="true"]'
  );

  if (!textbox) return false;

  textbox.focus();
  textbox.innerText = text;
  textbox.dispatchEvent(new Event("input", { bubbles: true }));

  return true;
}
