// @ts-check
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Accessibility fixes to Starlight's markup, applied to the built HTML.
 *
 * The search button is named by `aria-label="Search"` but also shows its shortcut (Ctrl K), so
 * its visible text is not part of its name (WCAG 2.5.3, Label in Name). Here the name comes from
 * the button's content instead: a visually hidden "Search", which also names it on phones, where
 * the visible label is hidden. The shortcut keys are hidden from assistive technology: the
 * button's `aria-keyshortcuts` already exposes them.
 *
 * Expressive Code makes a code block that scrolls sideways focusable, so keyboard users can scroll
 * it, but also gives it an unnamed `region` role, a landmark axe rightly reports. Every code block
 * starts focusable here, so the script only removes `tabindex` where nothing scrolls, and never
 * adds the role.
 *
 * Each fix throws when the markup it expects is missing, so a Starlight update that changes it
 * fails the build instead of silently dropping the fix.
 */
const SEARCH_BUTTON = /<button data-open-modal([^>]*?) aria-label="([^"]+)"([^>]*\baria-keyshortcuts="[^"]+"[^>]*)>([\s\S]*?)<kbd (class="[^"]*")/;

export function fixSearchShortcut(html, file = 'page') {
  if (!html.includes('data-open-modal')) return html;
  if (!SEARCH_BUTTON.test(html)) throw new Error(`${file}: the search button's markup changed; update integrations/a11y.mjs.`);
  return html.replace(
    SEARCH_BUTTON,
    (_, before, label, after, content, kbdClass) =>
      `<button data-open-modal${before}${after}><span class="sr-only">${label}</span>${content}<kbd aria-hidden="true" ${kbdClass}`,
  );
}

const CODE_BLOCK = /<pre data-language="([^"]*)">/g;

export function focusableCodeBlocks(html) {
  return html.replace(CODE_BLOCK, '<pre data-language="$1" tabindex="0">');
}

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith('.html')) yield path;
  }
}

/** @returns {import('astro').AstroIntegration} */
export default function a11y() {
  return {
    name: 'react-smart-copy:a11y',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        for await (const file of htmlFiles(fileURLToPath(dir))) {
          const html = await readFile(file, 'utf8');
          const fixed = focusableCodeBlocks(fixSearchShortcut(html, file));
          if (fixed !== html) await writeFile(file, fixed);
        }
      },
    },
  };
}
