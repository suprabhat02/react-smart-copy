import { TEXT_BLOCKS } from './policy';

/**
 * Readable plain text for sanitized rich content: blocks on their own lines, list
 * items with bullets or numbers (indented when nested), table cells separated by tabs,
 * images by their alt text, and preformatted text as it is.
 */
export function plainText(root: HTMLElement): string {
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    const trimmed = line.replace(/[ \t\u00A0]+$/, '');
    if (trimmed !== '' || (lines.length > 0 && lines[lines.length - 1] !== '')) lines.push(trimmed);
    line = '';
  };
  const breakBlock = () => {
    if (line.trim() !== '') flush();
    else line = '';
  };

  const walk = (node: Node, pre: boolean, depth: number): void => {
    if (node.nodeType === 3) {
      const data = (node as Text).data;
      line += pre ? data.replace(/\r\n?/g, '\n') : data.replace(/\s+/g, ' ');
      if (pre && line.includes('\n')) {
        const parts = line.split('\n');
        line = parts.pop() as string;
        for (const part of parts) lines.push(part);
      }
      if (!pre && line.trimStart() === '') line = '';
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement;
    const tag = element.localName;
    switch (tag) {
      case 'br':
        flush();
        return;
      case 'img':
        line += element.getAttribute('alt') ?? '';
        return;
      case 'hr':
        breakBlock();
        lines.push('\u2014'.repeat(3));
        return;
      case 'td':
      case 'th':
        if (element.previousElementSibling !== null) line += '\t';
        element.childNodes.forEach((child) => {
          walk(child, pre, depth);
        });
        return;
      case 'li': {
        breakBlock();
        const list = element.parentElement;
        const ordered = list?.localName === 'ol';
        let marker = '\u2022';
        if (ordered) {
          const items = Array.from(list.children).filter((child) => child.localName === 'li');
          const start = Number(list.getAttribute('start') ?? '1');
          const own = element.getAttribute('value');
          marker = `${String(own === null ? start + items.indexOf(element) : Number(own))}.`;
        }
        line = `${'  '.repeat(Math.max(0, depth - 1))}${marker} `;
        element.childNodes.forEach((child) => {
          walk(child, pre, depth);
        });
        breakBlock();
        return;
      }
      default: {
        const block = TEXT_BLOCKS.has(tag);
        const list = tag === 'ul' || tag === 'ol';
        if (block) breakBlock();
        const keep = pre || tag === 'pre' || /white-space:\s*pre/.test(element.getAttribute('style') ?? '');
        element.childNodes.forEach((child) => {
          walk(child, keep, list ? depth + 1 : depth);
        });
        if (block) breakBlock();
      }
    }
  };
  walk(root, false, 0);
  flush();
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
