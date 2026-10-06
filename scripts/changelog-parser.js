// Parses CHANGELOG.md (Changesets format) into release entries with
// pre-rendered HTML, for the docs site's release history.
//
// Supports a deliberately tiny Markdown subset: headings, nested lists,
// paragraphs, **bold**, *italic* and `code`. Every piece of text is HTML-escaped before
// inline formatting is applied, so nothing in the changelog can inject markup.

export const TYPE_HEADINGS = new Map([
  ['Major Changes', 'major'],
  ['Minor Changes', 'minor'],
  ['Patch Changes', 'patch'],
  ['Initial release', 'initial'],
]);

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

function inline(text) {
  // Split out `code` first so emphasis never applies inside it (e.g. `*/*`).
  return text
    .replace(/^[0-9a-f]{7}: /, '') // drop changeset commit prefixes
    .split(/(`[^`]+`)/)
    .map((part, i) =>
      i % 2 === 1
        ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
        : escapeHtml(part)
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^\w*])\*([^*\s][^*]*)\*(?![\w*])/g, '$1<em>$2</em>'),
    )
    .join('');
}

const indentOf = (line) => line.length - line.trimStart().length;

/** Renders an array of lines (already dedented) to HTML blocks. */
function blocks(lines) {
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '') {
      i++;
      continue;
    }
    const heading = /^(#{3,4}) (.+)$/.exec(trimmed);
    if (heading) {
      html += `<h4>${inline(heading[2])}</h4>`;
      i++;
      continue;
    }
    if (trimmed.startsWith('- ')) {
      const indent = indentOf(line);
      html += '<ul>';
      while (i < lines.length && indentOf(lines[i]) === indent && lines[i].trim().startsWith('- ')) {
        const item = [lines[i].trim().slice(2)];
        i++;
        // Continuation: blank lines, or lines indented deeper than the bullet.
        while (i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) > indent)) {
          item.push(lines[i].slice(Math.min(indent + 2, indentOf(lines[i]))));
          i++;
        }
        while (item.length > 0 && item[item.length - 1].trim() === '') item.pop();
        html += `<li>${blocks(item)}</li>`;
      }
      html += '</ul>';
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(- |#{3,4} )/.test(lines[i].trim())) {
      paragraph.push(lines[i].trim());
      i++;
    }
    html += `<p>${inline(paragraph.join(' '))}</p>`;
  }
  return html;
}

export function parseChangelog(markdown) {
  const releases = [];
  for (const section of markdown.split(/^## /m).slice(1)) {
    const [head, ...rest] = section.split('\n');
    const version = head.trim();
    if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) throw new Error(`Bad version heading: "${version}"`);
    let type = 'patch';
    const body = rest.filter((line) => {
      const match = /^### (.+)$/.exec(line.trim());
      if (match && TYPE_HEADINGS.has(match[1]) && indentOf(line) === 0) {
        type = TYPE_HEADINGS.get(match[1]);
        return false;
      }
      return true;
    });
    releases.push({ version, type, html: blocks(body) });
  }
  if (releases.length === 0) throw new Error('No releases found in CHANGELOG.md');
  return releases;
}
