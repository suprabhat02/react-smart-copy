import { describe, expect, it } from 'vitest';
import { isCopyFailure } from '../../src/core/errors';
import { htmlToMarkdown, type MarkdownOptions } from '../../src/markdown';
import { GITHUB, GITHUB_MD, GOOGLE_DOCS, GOOGLE_DOCS_MD, HOSTILE, HOSTILE_MD, MAIL, MAIL_MD, VS_CODE, WORD, WORD_MD } from './fixtures';
import { render, tagsOf } from './oracle';

const md = (html: string, options?: MarkdownOptions) => htmlToMarkdown(html, options).markdown;

describe('htmlToMarkdown: real clipboards', () => {
  it.each([
    ['Google Docs', GOOGLE_DOCS, GOOGLE_DOCS_MD],
    ['Word', WORD, WORD_MD],
    ['GitHub', GITHUB, GITHUB_MD],
    ['a mail client', MAIL, MAIL_MD],
    ['hostile HTML', HOSTILE, HOSTILE_MD],
  ])('%s', (_name, html, expected) => {
    expect(htmlToMarkdown(html)).toEqual({ markdown: expected, truncated: false });
  });

  it('a code editor selection becomes a code block', () => {
    expect(md(VS_CODE)).toBe('```\nconst a = 1;\n  return a;\n```');
  });

  it('never produces raw HTML, whatever the input', () => {
    for (const html of [GOOGLE_DOCS, WORD, GITHUB, MAIL, HOSTILE, VS_CODE]) {
      const tags = tagsOf(render(md(html, { images: 'keep' })));
      for (const forbidden of ['script', 'iframe', 'style', 'svg', 'span', 'div', 'b', 'i']) expect(tags.has(forbidden)).toBe(false);
    }
  });
});

describe('htmlToMarkdown: blocks', () => {
  it('headings, with bold dropped (headings are bold) and a trailing # escaped', () => {
    expect(md('<h1>Title <b>bold</b></h1><h3>C#</h3><h4>Sharp #</h4><h2></h2><h6>  </h6>')).toBe('# Title bold\n\n### C\\#\n\n#### Sharp \\#');
  });

  it('paragraphs, line breaks and two breaks in a row', () => {
    expect(md('<p>a<br>b<br><br>c<br> <br>d</p><p>  </p><p>e<br></p>')).toBe('a\\\nb\n\nc\n\nd\n\ne');
    expect(md('<p>a<br>b</p>', { hardBreak: 'spaces' })).toBe('a  \nb');
  });

  it('div lines join with line breaks; an empty div is a blank line', () => {
    expect(md('<div>a</div><div>b</div><div><br></div><div>c</div><p>p</p><div>d</div>')).toBe('a\\\nb\n\nc\n\np\n\nd');
    expect(md('<section>x<p>y</p>z</section>')).toBe('x\n\ny\n\nz');
  });

  it('inline elements wrapping blocks pass their style down (Google Docs wrapper, bold article)', () => {
    expect(md('<b><p>one</p><p>two</p></b>')).toBe('**one**\n\n**two**');
    expect(md('<i>lead<p>para</p>tail</i>')).toBe('*lead*\n\n*para*\n\n*tail*');
  });

  it('blockquotes, nested, with blank lines kept inside', () => {
    expect(md('<blockquote><p>a</p><blockquote><p>b</p></blockquote><p>c</p></blockquote><blockquote> </blockquote>')).toBe('> a\n>\n> > b\n>\n> c');
  });

  it('horizontal rules', () => {
    expect(md('<p>a</p><hr><p>b</p>')).toBe('a\n\n---\n\nb');
  });

  it('skips hidden, scripted, embedded and form content', () => {
    expect(md('<p>a<span hidden>h</span><span style="display:none">n</span><span style="visibility: hidden">v</span><script>s</script><button>Copy</button><textarea>t</textarea><select><option>o</option></select>b</p>')).toBe('ab');
  });

  it('keeps definition lists, details, figures and captions as text blocks', () => {
    expect(md('<dl><dt>Term</dt><dd>Def</dd></dl><details><summary>More</summary><p>Body</p></details><figure><img alt="Chart"><figcaption>Fig 1</figcaption></figure>')).toBe(
      'Term\\\nDef\n\nMore\n\nBody\n\nChart\\\nFig 1',
    );
  });

  it('accepts DOM nodes: an element with itself, a document by its body, a fragment by its children', () => {
    const doc = new DOMParser().parseFromString('<h2>Doc</h2>', 'text/html');
    expect(md(doc as never)).toBe('## Doc');
    const article = document.createElement('article');
    article.innerHTML = '<h1>A</h1><p>b</p>';
    document.body.append(article, document.createElement('p'));
    expect(htmlToMarkdown(article).markdown).toBe('# A\n\nb');
    const list = document.createElement('ul');
    list.innerHTML = '<li>x</li>';
    expect(htmlToMarkdown(list).markdown).toBe('- x');
    const fragment = document.createRange().createContextualFragment('<p>f</p><p>g</p>');
    expect(htmlToMarkdown(fragment).markdown).toBe('f\n\ng');
    const xml = new DOMParser().parseFromString('<root><p>x</p></root>', 'application/xml');
    expect(htmlToMarkdown(xml).markdown).toBe('x');
    article.remove();
  });
});

describe('htmlToMarkdown: inline formatting', () => {
  it('semantic tags and CSS (Google Docs, Word) both count; CSS wins', () => {
    expect(md('<p><b>b</b> <strong>s</strong> <i>i</i> <em>e</em> <s>s</s> <del>d</del> <strike>k</strike> <code>c</code> <kbd>K</kbd></p>')).toBe(
      '**b s** *i e* ~~s d k~~ `c` `K`',
    );
    expect(
      md('<p><span style="font-weight:bold">a</span> <span style="font-weight: 600">b</span> <b style="font-weight:normal">c</b> <b style="font-weight:300">d</b> <i style="font-style:normal">e</i> <span style="font-style:oblique">f</span> <span style="text-decoration-line: line-through">g</span> <span style="font-family: Menlo">h</span> <span style="font-weight:bolder">i</span> <b style="font-weight:lighter">j</b> <span style="color:red;">k</span></p>'),
    ).toBe('**a b** c d e *f* ~~g~~ `h` **i** j k');
  });

  it('merges adjacent spans with the same style and moves spaces outside delimiters', () => {
    expect(md('<p><b>on</b><b>e </b><b> two</b>!</p>')).toBe('**one two**!');
    expect(md('<p>a<b> b </b>c</p>')).toBe('a **b** c');
  });

  it('nests styles consistently', () => {
    expect(md('<p><b>a<i>b</i></b><i>c</i> <s><b>d</b></s></p>')).toBe('**a*b***_c_ ~~**d**~~');
  });

  it('drops formatting CommonMark cannot express there, never the text', () => {
    expect(md('<p>x<b>[y]</b>z</p>')).toBe('x\\[y\\]z');
    expect(md('<p>Price:<b>$5</b></p>')).toBe('Price:**$5**');
  });

  it('code spans pick a fence longer than any backtick run inside', () => {
    expect(md('<p><code>a`b</code> <code>``x``</code> <code>`</code> <code> a </code></p>')).toBe('``a`b`` ``` ``x`` ``` `` ` `` `a`');
  });

  it('escapes text that would read as Markdown, at line starts too', () => {
    expect(md('<p># a</p><p>- b</p><p>+ c</p><p>&gt; d</p><p>= e</p><p>| f</p><p>12) g</p><p>3. h</p><p>&amp;copy; &amp; i</p><p>~~j~~ _k_</p>')).toBe(
      '\\# a\n\n\\- b\n\n\\+ c\n\n\\> d\n\n\\= e\n\n\\| f\n\n12\\) g\n\n3\\. h\n\n\\&copy; & i\n\n\\~\\~j\\~\\~ \\_k\\_',
    );
  });

  it('keeps no-break spaces inside text and trims all whitespace at line edges', () => {
    expect(md('<p>  # 10 km </p><p> </p>')).toBe('\\# 10 km');
  });

  it('collapses HTML whitespace across elements', () => {
    expect(md('<p>  a \n\t <b> b </b>  \n c  </p>')).toBe('a **b** c');
  });
});

describe('htmlToMarkdown: links', () => {
  it('keeps http(s) and mailto, drops script and data URLs, keeps the text', () => {
    expect(md('<p><a href="https://a.example/x?y=1#z">a</a> <a href="mailto:hi@a.example">m</a> <a href="javascript:alert(1)">j</a> <a href="data:text/html,x">d</a></p>')).toBe(
      '[a](https://a.example/x?y=1#z) [m](mailto:hi@a.example) j d',
    );
  });

  it('relative links keep only their text, unless a base URL is given', () => {
    expect(md('<p><a href="/docs">docs</a> <a href="#top">top</a></p>')).toBe('docs top');
    expect(md('<p><a href="/docs">docs</a></p>', { baseUrl: 'https://site.example/a/' })).toBe('[docs](https://site.example/docs)');
  });

  it('unwraps Google and Outlook redirect links, only to http(s) targets', () => {
    expect(md('<a href="https://www.google.com/url?q=https://x.example/p&sa=D">g</a>')).toBe('[g](https://x.example/p)');
    expect(md('<a href="https://www.google.co.uk/url?url=https://y.example/">u</a>')).toBe('[u](https://y.example/)');
    expect(md('<a href="https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fz.example%2F&data=1">o</a>')).toBe('[o](https://z.example/)');
    expect(md('<a href="https://www.google.com/url?q=javascript:alert(1)">bad</a>')).toBe('[bad](<https://www.google.com/url?q=javascript:alert(1)>)');
    expect(md('<a href="https://www.google.com/search?q=x">search</a>')).toBe('[search](https://www.google.com/search?q=x)');
  });

  it('encodes destinations safely: parentheses, spaces, backslashes, angle brackets', () => {
    expect(md('<a href="https://en.wikipedia.org/wiki/Mars_(planet)">Mars</a>')).toBe('[Mars](<https://en.wikipedia.org/wiki/Mars_(planet)>)');
    expect(md('<a href="mailto:a b<c>@x.example">m</a>')).toBe('[m](mailto:a%20b%3Cc%3E@x.example)');
    expect(md('<a href="https://x.example/a\\b">s</a>')).toBe('[s](https://x.example/a/b)');
    expect(md('<a href="mailto:a\\b　c@x">n</a>')).toBe('[n](mailto:a%5Cb%E3%80%80c@x)');
  });

  it('formatting inside links, nested links and empty links', () => {
    expect(md('<p><a href="https://x.example"><b>bold</b> link</a></p>')).toBe('[**bold** link](https://x.example/)');
    expect(md('<p><a href="https://x.example">out <a href="https://y.example">in</a></a></p>')).toBe('[out](https://x.example/) [in](https://y.example/)');
    expect(md('<p>a<a href="https://x.example"> </a>b <a href="https://x.example"></a>c</p>')).toBe('a b c');
    expect(md('<p><b>a<a href="https://x.example">b</a></b></p>')).toBe('**a**[**b**](https://x.example/)');
  });

  it("links: 'text' keeps only the text", () => {
    expect(md('<a href="https://x.example">x</a>', { links: 'text' })).toBe('x');
  });

  it('custom link protocols', () => {
    expect(md('<a href="ftp://x.example/f">f</a>', { linkProtocols: ['ftp:'] })).toBe('[f](ftp://x.example/f)');
    expect(md('<a href="https://x.example/f">f</a>', { linkProtocols: ['ftp:'] })).toBe('f');
  });
});

describe('htmlToMarkdown: images', () => {
  const html = '<p>A <img src="https://img.example/a.png" alt="cat  photo"> B <img src="https://img.example/b.png"> <img src="data:image/png;base64,AA" alt="inline"> <img src="/rel.png" alt="rel"></p>';

  it("'alt' (default): alt text only, nothing to fetch", () => {
    expect(md(html)).toBe('A cat photo B inline rel');
  });

  it("'keep': allowed URLs as images, others fall back to alt text", () => {
    expect(md(html, { images: 'keep' })).toBe('A ![cat photo](https://img.example/a.png) B ![](https://img.example/b.png) inline rel');
    expect(md(html, { images: 'keep', baseUrl: 'https://img.example/' })).toContain('![rel](https://img.example/rel.png)');
    expect(md('<a href="https://x.example"><img src="https://i.example/i.png" alt="[logo]"></a>', { images: 'keep' })).toBe(
      '[![\\[logo\\]](https://i.example/i.png)](https://x.example/)',
    );
    expect(md(html, { images: 'keep', imageProtocols: ['data:'] })).toContain('![inline](data:image/png;base64,AA)');
  });

  it("'drop': removed", () => {
    expect(md(html, { images: 'drop' })).toBe('A B');
  });
});

describe('htmlToMarkdown: lists', () => {
  it('bullets, numbers with start, nesting and continuation indent', () => {
    expect(md('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul><ol start="9"><li>x<ol><li>y</li></ol></li><li><p>p1</p><p>p2</p></li></ol>')).toBe(
      '- a\n  - b\n- c\n\n9. x\n   1. y\n10. p1\n\n    p2',
    );
  });

  it('two lists in a row get different markers, so they stay two lists', () => {
    expect(md('<ul><li>a</li></ul><ul><li>b</li></ul><ul><li>c</li></ul><ol><li>d</li></ol><ol><li>e</li></ol>')).toBe(
      '- a\n\n* b\n\n- c\n\n1. d\n\n1) e',
    );
    expect(md('<ul><li>a</li></ul><ul><li>b</li></ul>', { bullet: '*' })).toBe('* a\n\n- b');
    expect(md('<ul><li>a</li></ul><ul><li>b</li></ul>', { bullet: '+' })).toBe('+ a\n\n- b');
  });

  it('task lists: checkboxes, ARIA checkboxes (Google Docs), checkboxes of nested items stay theirs', () => {
    expect(md('<ul><li><input type="checkbox" checked> done<ul><li><input type="checkbox"> sub</li></ul></li><li role="checkbox" aria-checked="false">todo</li><li role="checkbox" aria-checked="mixed">mixed</li></ul>')).toBe(
      '- [x] done\n  - [ ] sub\n- [ ] todo\n- mixed',
    );
  });

  it('empty items, stray children, menus and invalid starts', () => {
    expect(md('<ul><li></li>stray<b>bold</b><li>x</li></ul><menu><li>m</li></menu><ol start="-2"><li>n</li></ol><ol start="abc"><li>o</li></ol>')).toBe(
      '-\n- stray\n- **bold**\n- x\n\n* m\n\n1. n\n\n1) o',
    );
  });

  it('code blocks and quotes inside items are indented', () => {
    expect(md('<ol><li>run<pre>npm i\nnpm t</pre></li><li><blockquote>q</blockquote></li></ol>')).toBe('1. run\n\n   ```\n   npm i\n   npm t\n   ```\n2. > q');
  });

  it('a nested list right after the first item is attached to it (Google Docs)', () => {
    expect(md('<ul><ol><li>orphan</li></ol><li>a</li><ol><li>b</li></ol></ul>')).toBe('- 1. orphan\n- a\n  1. b');
  });

  describe('Word', () => {
    const p = (level: number, marker: string, text: string, list = 'l0') =>
      `<p class=MsoListParagraph style='mso-list:${list} level${String(level)} lfo1'><![if !supportLists]><span style='mso-list:Ignore'>${marker}<span>&nbsp; </span></span><![endif]>${text}</p>`;

    it('levels, markers (numbers, letters, roman, bullets) and start numbers', () => {
      expect(md(p(1, '3.', 'three') + p(2, 'a)', 'alpha') + p(3, '·', 'deep') + p(2, 'iv.', 'roman') + p(1, '4.', 'four'))).toBe(
        '3. three\n   1. alpha\n      - deep\n   2. roman\n4. four',
      );
    });

    it('a change of list type starts a new list; text in between ends the list', () => {
      expect(md(p(1, '1.', 'one') + p(1, '§', 'bullet') + '<p>between</p>' + p(1, '(1)', 'again'))).toBe('1. one\n\n- bullet\n\nbetween\n\n1. again');
    });

    it('a level that skips a step still nests, and comments between paragraphs are ignored', () => {
      expect(md(p(1, '·', 'a') + '<!-- x -->\n' + p(3, '·', 'c') + p(1, '·', 'b'))).toBe('- a\n  - c\n- b');
    });

    it('a list starting below level 1, and changing type at a nested level', () => {
      expect(md(p(2, '·', 'deep') + p(2, '1.', 'num'))).toBe('- deep\n\n1. num');
      expect(md(p(1, '·', 'a') + p(2, '·', 'b') + p(2, '1.', 'c'))).toBe('- a\n  - b\n\n  1. c');
    });
  });
});

describe('htmlToMarkdown: code blocks', () => {
  it('language from class names and data attributes; unsafe names ignored', () => {
    expect(md('<pre><code class="language-ts">let a</code></pre>')).toBe('```ts\nlet a\n```');
    expect(md('<pre class="lang-py">x</pre>')).toBe('```py\nx\n```');
    expect(md('<pre data-language="c++">y</pre>')).toBe('```c++\ny\n```');
    expect(md('<pre><code class="language-a`b">z</code></pre>')).toBe('```\nz\n```');
  });

  it('fences longer than any backtick run inside; lines from <br> and <div>; tabs and no-break spaces', () => {
    expect(md('<pre>a\n```\nb</pre>')).toBe('````\na\n```\nb\n````');
    expect(md('<pre><div>l1</div><div>\tl2</div><p>l3</p>l4<br>l5 x</pre>')).toBe('```\nl1\n\tl2\nl3\nl4\nl5 x\n```');
    expect(md('<pre>\r\nwin\r\nlines\r\n\n</pre>')).toBe('```\nwin\nlines\n```');
  });

  it('empty code blocks are dropped; hidden parts are skipped', () => {
    expect(md('<pre>  \n </pre><pre>a<span hidden>b</span><script>c</script></pre>')).toBe('```\na\n```');
  });

  it('a <pre> inside a heading or cell becomes inline code', () => {
    expect(md('<h2>Use <pre>npm i</pre></h2>')).toBe('## Use `npm i`');
  });
});

describe('htmlToMarkdown: tables', () => {
  it('first row as header, alignment, merged cells, pipes escaped, header cells not bold', () => {
    const html =
      '<table><caption>Q4</caption><thead><tr><th align="left">Name</th><th style="text-align: center">Region</th><th align="right"><b>Seats</b></th></tr></thead>' +
      '<tbody><tr><td rowspan="2">Ada</td><td colspan="2">EU | UK</td></tr><tr><td>US</td><td><code>a|b</code></td></tr></tbody></table>';
    expect(md(html)).toBe('Q4\n\n| Name | Region | Seats |\n| :--- | :---: | ---: |\n| Ada | EU \\| UK |  |\n|  | US | `a\\|b` |');
  });

  it('cells are one line: blocks and breaks become spaces; ragged rows are padded', () => {
    expect(md('<table><tr><td><p>a</p><p>b</p></td><td>x<br>y</td></tr><tr><td>1</td></tr></table>')).toBe('| a b | x y |\n| --- | --- |\n| 1 |  |');
  });

  it('rowspan="0" spans to the end; spans are capped', () => {
    expect(md('<table><tr><td rowspan="0">a</td><td>b</td></tr><tr><td>c</td></tr><tr><td>d</td></tr></table>')).toBe('| a | b |\n| --- | --- |\n|  | c |\n|  | d |');
  });

  it('layout tables (mail, old pages) become their content', () => {
    expect(md('<table role="presentation"><tr><td>a</td><td>b</td></tr></table><table role="none"><tr><td>c</td></tr></table>')).toBe('a\\\nb\\\nc');
    expect(md('<table><tr><td><h3>T</h3></td><td>x</td></tr></table>')).toBe('### T\n\nx');
    expect(md('<table><tr><td><p>only</p></td></tr></table>')).toBe('only');
  });

  it('empty tables are dropped', () => {
    expect(md('<table></table><table><tr><td> </td><td></td></tr></table>')).toBe('');
    expect(md('<table><caption>Cap</caption><tr><td></td><td></td></tr></table>')).toBe('Cap');
  });

  it('a merged cell claiming huge spans is capped and reported', () => {
    const result = htmlToMarkdown(`<table>${'<tr><td colspan="1000" rowspan="1000">x</td><td>y</td></tr>'.repeat(200)}</table>`);
    expect(result.truncated).toBe(true);
    // The content is kept, the merge is dropped.
    expect(result.markdown.split('\n').slice(0, 3)).toEqual(['| x | y |', '| --- | --- |', '| x | y |']);
  });
});

describe('htmlToMarkdown: limits and options', () => {
  it('maxLength cuts the input and reports it', () => {
    expect(htmlToMarkdown('<p>abcdef</p>', { maxLength: 7 })).toEqual({ markdown: 'abcd', truncated: true });
  });

  it('maxNodes stops visiting and reports it', () => {
    const html = `<p>${'<b>x</b>'.repeat(100)}</p><pre>${'<span>y</span>'.repeat(100)}</pre>`;
    expect(htmlToMarkdown(html, { maxNodes: 50 }).truncated).toBe(true);
    // <p> + 100 × (<b> + text) + <pre> + 100 × (<span> + text) = 402 nodes.
    expect(htmlToMarkdown(html, { maxNodes: 401 }).truncated).toBe(true);
    expect(htmlToMarkdown(html, { maxNodes: 402 }).truncated).toBe(false);
  });

  it('maxDepth keeps the text of deeper content, without its formatting', () => {
    const deep = `${'<div>'.repeat(30)}<b>deep</b> text${'</div>'.repeat(30)}`;
    expect(htmlToMarkdown(deep, { maxDepth: 10 })).toEqual({ markdown: 'deep text', truncated: false });
    const deepCode = `<pre>${'<span>'.repeat(30)}code${'</span>'.repeat(30)}</pre>`;
    expect(md(deepCode, { maxDepth: 10 })).toBe('```\ncode\n```');
  });

  it('deep nesting does not overflow the stack', () => {
    const html = `${'<span>'.repeat(3000)}ok${'</span>'.repeat(3000)}`;
    expect(md(html)).toBe('ok');
  });

  it.each(['maxLength', 'maxNodes', 'maxDepth'] as const)('rejects an invalid %s', (name) => {
    for (const bad of [0, -1, 1.5, NaN]) {
      let error: unknown;
      try {
        htmlToMarkdown('<p>x</p>', { [name]: bad });
      } catch (caught) {
        error = caught;
      }
      expect(isCopyFailure(error) && error.copyError.type).toBe('invalid-payload');
    }
    expect(htmlToMarkdown('<p>x</p>', { [name]: Infinity }).markdown).toBe('x');
  });
});

describe('htmlToMarkdown: edge cases', () => {
  it('font weights that are neither bold nor normal change nothing', () => {
    expect(md('<p><b style="font-weight: inherit">a</b> <span style="font-weight: var(--w)">b</span></p>')).toBe('**a** b');
  });

  it('anchors without href, images without src', () => {
    expect(md('<p><a name="top">anchor</a> <img alt="no src"></p>', { images: 'keep' })).toBe('anchor no src');
  });

  it('text before a line-shaped element in code starts a new line', () => {
    expect(md('<pre>a<div>b</div>c</pre>')).toBe('```\na\nb\nc\n```');
  });

  it('a Word list paragraph without a marker is a bullet item', () => {
    expect(md("<p style='mso-list:l1 level1 lfo2'>plain</p>")).toBe('- plain');
  });

  it('a header row shorter than the table gets default alignment for the extra columns', () => {
    expect(md('<table><tr><td align="center">a</td></tr><tr><td>b</td><td>c</td></tr></table>')).toBe('| a |  |\n| :---: | --- |\n| b | c |');
  });

  it('switching markers leaves nested and continuation lines alone', () => {
    expect(md('<ul><li>a</li></ul><ul><li>b<ul><li>c</li></ul><p>more</p></li></ul>')).toBe('- a\n\n* b\n  - c\n\n  more');
    expect(md('<ol start="9"><li>a</li></ol><ol start="10"><li>b</li><li>c</li></ol>')).toBe('9. a\n\n10) b\n11) c');
  });

  it('a checkbox that belongs to a nested item does not make the outer item a task', () => {
    expect(md('<ul><li>outer<ul><li><input type="checkbox" checked> inner</li></ul></li></ul>')).toBe('- outer\n  - [x] inner');
  });

  it('empty spaced containers add nothing', () => {
    expect(md('<p>a</p><dl></dl><figure> </figure><p>b</p>')).toBe('a\n\nb');
  });

  it('adjacent code runs form one code span (Google Docs splits them)', () => {
    expect(md('<p><code>a</code><code>b</code> <span style="font-family:monospace">x</span><span style="font-family:monospace">y</span></p>')).toBe('`ab` `xy`');
  });

  it('spans that end up touching after a dropped delimiter join into one', () => {
    expect(md('<p><b><i>a</i></b><b><s>A</s></b><b><i><s>A</s></i></b><i><s>a</s></i></p>')).toBe('*a*~~AA*a*~~');
  });

  it('strikethrough that cannot open there is dropped, its text kept', () => {
    expect(md('<p>x<s>[a]</s>y</p>')).toBe('x\\[a\\]y');
  });

  it('delimiters next to astral characters see the whole character', () => {
    // U+1BC9C is a symbol (punctuation to CommonMark) written as a surrogate pair.
    expect(md('<p>a<b>\u{1BC9C}</b></p>')).toBe('a\u{1BC9C}');
    expect(md('<p><b>\u{1BC9C}</b>a</p>')).toBe('\u{1BC9C}a');
    expect(md('<p><b>\u{1BC9C}</b> a</p>')).toBe('**\u{1BC9C}** a');
    for (const markdown of [md('<p><b>\u{1BC9C}</b>a</p>'), md('<p><b>\u{1BC9C}</b> a</p>')]) {
      expect(render(markdown).textContent.trim()).toMatch(/^\u{1BC9C} ?a$/u);
    }
  });

  it('whitespace between list items is ignored', () => {
    expect(md('<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>')).toBe('- a\n- b');
  });

  it('delimiters next to line breaks', () => {
    expect(md('<p><b>a</b><br><b>b</b></p>')).toBe('**a**\\\n**b**');
  });

  describe('emphasis where one span ends and another begins', () => {
    const cases: readonly (readonly [html: string, markdown: string])[] = [
      ['x <i>a</i><b>b</b>', 'x _a_**b**'],
      ['(<i>[a</i><b>b</b>', '(_\\[a_**b**'],
      ['x <i>[a]</i><b>b</b>', 'x _\\[a\\]_**b**'],
      ['<b>a</b><i>b</i>c', '**a**bc'],
      ['x<i>a</i><b>b</b>', 'xa**b**'],
    ];
    it.each(cases)('%s', (html, expected) => {
      const markdown = md(`<p>${html}</p>`);
      expect(markdown).toBe(expected);
      // Whatever survives renders as the same text.
      const source = document.createElement('p');
      source.innerHTML = html;
      expect(render(markdown).querySelector('p')?.textContent).toBe(source.textContent);
    });
  });
});
