/**
 * Copying a rendered page as Markdown ("Copy page" buttons for AI chats), and pasting a section
 * of a documentation site. Heading permalinks are left out, as are elements the page marks.
 * Markup as each generator writes it.
 */
import { describe, expect, it } from 'vitest';
import { CopyFailure } from '../../src/core';
import { htmlToMarkdown, pasteToMarkdown } from '../../src/markdown';

const md = (html: string, options?: Parameters<typeof htmlToMarkdown>[1]): string => htmlToMarkdown(html, options).markdown;

describe('heading permalinks', () => {
  it.each([
    [
      'Starlight (a link beside the heading, with screen-reader text)',
      '<div class="sl-heading-wrapper level-h2"><h2 id="try-it">Try it</h2><a class="sl-anchor-link" href="#try-it"><span aria-hidden="true"><svg></svg></span><span class="sr-only">Section titled “Try it”</span></a></div><p>Body.</p>',
      '## Try it\n\nBody.',
    ],
    ['Docusaurus (zero-width space inside)', '<h2 class="anchor" id="install">Install<a href="#install" class="hash-link" aria-label="Direct link to Install">\u200b</a></h2><p>Body.</p>', '## Install\n\nBody.'],
    ['VitePress', '<h2 id="getting-started" tabindex="-1">Getting started <a class="header-anchor" href="#getting-started" aria-label="Permalink to “Getting started”">\u200b</a></h2>', '## Getting started'],
    ['MkDocs (a pilcrow)', '<h3 id="options">Options<a class="headerlink" href="#options" title="Permanent link">¶</a></h3>', '### Options'],
    ['Sphinx (the id is on the section, not the heading)', '<section id="usage"><h2>Usage<a class="headerlink" href="#usage" title="Link to this heading">¶</a></h2></section>', '## Usage'],
    [
      'GitHub (an icon link after a heading without an id)',
      '<div class="markdown-heading"><h2 class="heading-element">Features</h2><a id="user-content-features" class="anchor" href="#features"><svg class="octicon"></svg></a></div>',
      '## Features',
    ],
    ['percent-encoded ids', '<h2 id="über">Über<a href="#%C3%BCber">#</a></h2>', '## Über'],
  ])('%s', (_name, html, expected) => {
    expect(md(html)).toBe(expected);
  });

  it('keeps fragment links that are not a heading’s own', () => {
    // Relative links need `baseUrl` to stay links; without it they keep their text, as before.
    const base = { baseUrl: 'https://example.com/docs/' };
    // Elsewhere in the text, a table of contents, and a heading whose whole text is the link.
    expect(md('<p>See <a href="#install">Install</a>.</p>', base)).toBe('See [Install](https://example.com/docs/#install).');
    expect(md('<h2 id="a">A <a href="#b">see B</a></h2>', base)).toBe('## A [see B](https://example.com/docs/#b)');
    expect(md('<h2 id="install"><a href="#install">Install</a></h2>', base)).toBe('## [Install](https://example.com/docs/#install)');
    expect(md('<h2 id="x">X</h2><a href="#elsewhere">More</a>', base)).toBe('## X\n\n[More](https://example.com/docs/#elsewhere)');
    expect(md('<h2 id="x">X <a href="#">top</a></h2>', base)).toBe('## X [top](https://example.com/docs/#)');
    expect(md('<p><a href="#x">¶</a></p>', base)).toBe('[¶](https://example.com/docs/#x)');
  });

  it('reads a malformed fragment as written', () => {
    expect(md('<h2 id="%E0%A4%A">Bad<a href="#%E0%A4%A">link</a></h2>')).toBe('## Bad');
    expect(md('<h2 id="other">Bad <a href="#%E0%A4%A">link</a></h2>')).toBe('## Bad link');
  });

  it('are left out of a pasted docs section too', () => {
    const html = '<h3 id="options">Options<a class="headerlink" href="#options">¶</a></h3><p>Set <code>baseUrl</code>.</p>';
    expect(pasteToMarkdown({ html, text: 'Options¶\nSet baseUrl.' })?.markdown).toBe('### Options\n\nSet `baseUrl`.');
  });
});

describe('elements the page leaves out', () => {
  it('skips [data-copy-ignore] always, and what `ignore` selects', () => {
    const html = '<p>Intro.</p><section class="demo"><p>Hover a row.</p></section><div data-copy-ignore><p>Ad</p></div><p>Outro.</p>';
    expect(md(html)).toBe('Intro.\n\nHover a row.\n\nOutro.');
    expect(md(html, { ignore: '.demo, .other' })).toBe('Intro.\n\nOutro.');
  });

  it('works on a live element, and refuses a selector that is not CSS', () => {
    const article = document.createElement('article');
    article.innerHTML = '<h1 id="t">Title<a href="#t">#</a></h1><p>Text <span class="badge">new</span></p>';
    expect(htmlToMarkdown(article, { ignore: '.badge' }).markdown).toBe('# Title\n\nText');
    expect(() => htmlToMarkdown(article, { ignore: '[[' })).toThrow(CopyFailure);
    expect(() => md('<p>x</p>', { ignore: ')' })).toThrow('`ignore` is not a valid CSS selector: )');
    // A whole document converts its body.
    expect(htmlToMarkdown(document, { ignore: '.nothing' }).truncated).toBe(false);
  });
});
