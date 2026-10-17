/**
 * Clipboard HTML in the shapes real apps write. Reconstructed from the formats
 * each app uses (Google Docs' docs-internal-guid wrapper and CSS-only styling,
 * Word's MsoListParagraph + mso-list markup with conditional comments, GitHub's
 * rendered Markdown, a VS Code selection, a mail client's div lines).
 */

export const GOOGLE_DOCS = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1f2e3d4c-7fff-a1b2-c3d4"><h1 dir="ltr" style="line-height:1.38;margin-top:20pt;"><span style="font-size:20pt;font-family:Arial,sans-serif;font-weight:400;font-style:normal;">Release plan</span></h1><p dir="ltr" style="line-height:1.38;"><span style="font-weight:400;">We ship </span><span style="font-weight:700;">on Friday</span><span style="font-weight:400;"> with </span><span style="font-weight:400;font-style:italic;">care</span><span style="font-weight:400;">. See </span><a href="https://www.google.com/url?q=https://example.com/docs&amp;sa=D&amp;source=editors&amp;ust=1&amp;usg=AOv" style="text-decoration:none;"><span style="color:#1155cc;text-decoration:underline;">the docs</span></a><span>.</span></p><ul style="margin-top:0;margin-bottom:0;"><li dir="ltr" style="list-style-type:disc;" aria-level="1"><p dir="ltr" role="presentation"><span>First</span></p></li><ul style="margin-top:0;"><li dir="ltr" aria-level="2"><p dir="ltr" role="presentation"><span>Nested</span></p></li></ul><li dir="ltr" aria-level="1"><p dir="ltr" role="presentation"><span>Second </span><span style="font-family:'Courier New',monospace;">npm i</span></p></li></ul><br><div dir="ltr" style="margin-left:0pt;" align="left"><table style="border:none;border-collapse:collapse;"><colgroup><col width="120"><col width="80"></colgroup><tbody><tr style="height:0pt"><td style="border-left:solid #000 1pt;"><p dir="ltr"><span style="font-weight:700;">Name</span></p></td><td><p dir="ltr" style="text-align:right;"><span>Seats</span></p></td></tr><tr><td><p dir="ltr"><span>Ada | Co</span></p></td><td><p dir="ltr"><span>42</span></p></td></tr></tbody></table></div><ul role="list"><li role="checkbox" aria-checked="true" aria-level="1"><p><span style="text-decoration:line-through;">Draft</span></p></li><li role="checkbox" aria-checked="false" aria-level="1"><p><span>Review</span></p></li></ul></b>`;

export const GOOGLE_DOCS_MD = `# Release plan

We ship **on Friday** with *care*. See [the docs](https://example.com/docs).

- First
  - Nested
- Second \`npm i\`

| **Name** | Seats |
| --- | --- |
| Ada \\| Co | 42 |

- [x] ~~Draft~~
- [ ] Review`;

export const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style><!-- p.MsoNormal {margin:0in;} --></style></head><body lang=EN-US><div class=WordSection1><p class=MsoNormal><b>Agenda<o:p></o:p></b></p><p class=MsoListParagraphCxSpFirst style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Budget<o:p></o:p></p><p class=MsoListParagraphCxSpMiddle style='margin-left:1.0in;mso-add-space:auto;text-indent:-.25in;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:"Courier New";mso-fareast-font-family:"Courier New"'><span style='mso-list:Ignore'>o<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><![endif]>Q4 <i>numbers</i><o:p></o:p></p><p class=MsoListParagraphCxSpLast style='text-indent:-.25in;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>2.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span><![endif]>Hiring<o:p></o:p></p><p class=MsoNormal><o:p>&nbsp;</o:p></p><p class=MsoNormal>Thanks!<o:p></o:p></p></div></body></html>`;

export const WORD_MD = `**Agenda**

1. Budget
   - Q4 *numbers*
2. Hiring

Thanks!`;

export const GITHUB = `<div class="markdown-heading" dir="auto"><h2 tabindex="-1" class="heading-element" dir="auto">Install</h2><a id="user-content-install" class="anchor" aria-label="Permalink: Install" href="#install"><svg class="octicon octicon-link" viewBox="0 0 16 16"><path d="M7.775"></path></svg></a></div><div class="highlight highlight-source-shell notranslate position-relative overflow-auto" dir="auto"><pre>npm install react-smart-copy</pre><div class="zeroclipboard-container"><clipboard-copy aria-label="Copy" class="ClipboardButton btn" value="npm install react-smart-copy" tabindex="0" role="button"><svg aria-hidden="true"></svg></clipboard-copy></div></div><ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled="" checked=""> Done <code>a\`b</code></li><li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled=""> Todo</li></ul><blockquote><p dir="auto">Note: <em>be careful</em></p></blockquote>`;

export const GITHUB_MD = `## Install

\`\`\`shell
npm install react-smart-copy
\`\`\`

- [x] Done \`\`a\`b\`\`
- [ ] Todo

> Note: *be careful*`;

export const VS_CODE = `<meta charset='utf-8'><div style="color: #cccccc;background-color: #1f1f1f;font-family: Consolas, 'Courier New', monospace;font-weight: normal;font-size: 14px;line-height: 19px;white-space: pre;"><div><span style="color: #569cd6;">const</span><span style="color: #cccccc;"> </span><span style="color: #4fc1ff;">a</span><span style="color: #cccccc;"> = </span><span style="color: #b5cea8;">1</span><span style="color: #cccccc;">;</span></div><div><span style="color: #cccccc;">&nbsp; </span><span style="color: #c586c0;">return</span><span style="color: #cccccc;"> a;</span></div></div>`;

export const VS_CODE_TEXT = 'const a = 1;\n  return a;';

export const MAIL = `<div dir="ltr"><div>Hi Ada,</div><div><br></div><div>Line one</div><div>Line <b>two</b></div><table role="presentation" width="100%"><tr><td><p>Cell para</p><table><tr><td>inner</td></tr></table></td></tr></table></div>`;

export const MAIL_MD = `Hi Ada,

Line one\\
Line **two**

Cell para

inner`;

export const HOSTILE = `<p>1. Not a list <script>alert(1)</script>&lt;img src=x onerror=alert(1)&gt; *stars* # hash</p><a href="javascript:alert(1)">click</a> <a href="  JaVa&#x09;script:alert(1)">tab</a> <a href="data:text/html,<script>alert(1)</script>">data</a> <a href="vbscript:x">vb</a> <img src="https://tracker.example/p.gif" alt="logo"> <img src="data:image/png;base64,AAAA" alt=""><iframe src="https://evil.example"></iframe><style>p{}</style><p hidden>secret</p><p style="display: none">also secret</p>`;

export const HOSTILE_MD = `1\\. Not a list \\<img src=x onerror=alert(1)> \\*stars\\* # hash

click tab data vb logo`;
