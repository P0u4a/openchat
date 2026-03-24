import { marked } from "marked";
import DOMPurify from "dompurify";

export async function renderMarkdown(markdown: string) {
  return DOMPurify.sanitize(await marked.parse(markdown));
}
