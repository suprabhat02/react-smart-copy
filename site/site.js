// Page chrome: header, playground tabs, docs contents, code blocks, tables
// and the release history. Clipboard demos live in demos.js.
import { wireCopyButton } from "./lib.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/* ── Header border once the page scrolls ─────────────────────────── */
const header = $(".top");
const onScroll = () => header?.toggleAttribute("data-scrolled", window.scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ── Theme: follows the system until the visitor picks one ───────── */
const THEME_KEY = "rsc-theme";
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const themeButton = $("[data-theme-toggle]");
const THEME_COLOR = { light: "#f6f8f0", dark: "#06110d" };

const currentTheme = () => document.documentElement.dataset.theme ?? (systemDark.matches ? "dark" : "light");

function renderTheme() {
  const theme = currentTheme();
  themeButton?.setAttribute("aria-pressed", String(theme === "dark"));
  // Browser chrome (mobile address bar) matches the page, whichever way it was chosen.
  for (const meta of $$("meta[data-theme-color]")) {
    meta.content = document.documentElement.dataset.theme ? THEME_COLOR[theme] : THEME_COLOR[meta.dataset.themeColor];
  }
}

function setTheme(theme) {
  const root = document.documentElement;
  // Picking the system's own theme means "follow the system" again.
  const followSystem = theme === (systemDark.matches ? "dark" : "light");
  if (followSystem) delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (followSystem) localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage blocked (private mode, policy): the choice lasts for this page view.
  }
  renderTheme();
}

themeButton?.addEventListener("click", () => {
  // aria-pressed tells screen readers the new state; no extra announcement needed.
  setTheme(currentTheme() === "dark" ? "light" : "dark");
});
systemDark.addEventListener("change", renderTheme);
renderTheme();

/* ── Compact header menu (disclosure pattern) ────────────────────── */
const menuButton = $("[data-menu-toggle]");
const menu = $("#site-menu");
const compact = matchMedia("(max-width: 52rem)");

const menuOpen = () => menuButton?.getAttribute("aria-expanded") === "true";

function setMenu(open, { focusFirst = false, returnFocus = false } = {}) {
  if (!menuButton || !menu) return;
  menuButton.setAttribute("aria-expanded", String(open));
  menu.toggleAttribute("data-open", open);
  if (open && focusFirst) $("a", menu)?.focus();
  else if (!open && returnFocus) menuButton.focus();
}

// Opened from the keyboard (Enter/Space report detail 0), focus moves into the
// menu. A tap or click leaves focus alone: iOS Safari never focuses a tapped
// button, and moving focus there would only fight the browser.
menuButton?.addEventListener("click", (event) => setMenu(!menuOpen(), { focusFirst: event.detail === 0 }));
// Following a link closes the menu. The browser scrolls to the section; focus
// then moves there too, so keyboard and screen-reader users continue from it.
menu?.addEventListener("click", (event) => {
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  if (!link || !compact.matches) return;
  setMenu(false);
  const id = link.hash ? decodeURIComponent(link.hash.slice(1)) : "";
  if (!id) return;
  setTimeout(() => {
    const target = document.getElementById(id);
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });
});
// The menu sits before its button in the page, so Tab from the open button
// would skip it. Send Tab into the menu instead.
menuButton?.addEventListener("keydown", (event) => {
  if (event.key !== "Tab" || event.shiftKey || !menuOpen()) return;
  const first = $("a", menu);
  if (!first) return;
  event.preventDefault();
  first.focus();
});
addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuOpen()) {
    event.preventDefault();
    setMenu(false, { returnFocus: true });
  }
});
// Tapping or clicking outside the header closes it.
addEventListener("pointerdown", (event) => {
  if (menuOpen() && event.target instanceof Node && !header?.contains(event.target)) setMenu(false);
});
// So does focus arriving somewhere else, which only happens with Tab. This
// listens for where focus lands, not for where it left: on iOS a tap blurs the
// focused link without focusing anything, and must not count as leaving.
addEventListener("focusin", (event) => {
  if (!menuOpen() || !compact.matches || !(event.target instanceof Node)) return;
  if (menu?.contains(event.target) || event.target === menuButton) return;
  setMenu(false);
});
compact.addEventListener("change", () => {
  if (!compact.matches) setMenu(false);
});

/* ── GitHub stars: shown once the number is worth showing ────────── */
const STAR_MIN = 10;
const STAR_CACHE = "rsc-stars";
const starCount = $("[data-star-count]");

function showStars(count) {
  if (!starCount || !Number.isFinite(count) || count < STAR_MIN) return;
  const label = new Intl.NumberFormat("en", { notation: "compact" }).format(count);
  starCount.replaceChildren(label);
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = ` stars`;
  starCount.append(sr);
  starCount.hidden = false;
}

async function loadStars() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(STAR_CACHE) ?? "null");
    if (cached && Date.now() - cached.at < 3_600_000) return showStars(cached.count);
  } catch {
    // No session storage: fetch instead.
  }
  try {
    const response = await fetch("https://api.github.com/repos/suprabhat02/react-smart-copy", {
      headers: { accept: "application/vnd.github+json" },
    });
    if (!response.ok) return;
    const { stargazers_count: count } = await response.json();
    try {
      sessionStorage.setItem(STAR_CACHE, JSON.stringify({ count, at: Date.now() }));
    } catch {
      // Not cached; harmless.
    }
    showStars(count);
  } catch {
    // Offline or rate-limited: the button still works without a number.
  }
}
void loadStars();

/* ── Playground tabs (WAI-ARIA tabs, manual activation) ──────────── */
const tabs = $$('[role="tab"]');
// Old anchors from earlier versions of this page keep working.
const LEGACY = { paste: "paste", "paste-field": "paste-field", "copy-group": "group", capture: "capture" };

function selectTab(tab, { focus = false, updateHash = false } = {}) {
  for (const other of tabs) {
    const selected = other === tab;
    other.setAttribute("aria-selected", String(selected));
    other.tabIndex = selected ? 0 : -1;
    $(`#${other.getAttribute("aria-controls")}`).hidden = !selected;
  }
  if (focus) tab.focus();
  if (updateHash) history.replaceState(null, "", `#try-${tab.dataset.tab}`);
}

for (const tab of tabs) {
  tab.addEventListener("click", () => selectTab(tab, { updateHash: true }));
  tab.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(tab);
    const next = {
      ArrowRight: tabs[(index + 1) % tabs.length],
      ArrowLeft: tabs[(index - 1 + tabs.length) % tabs.length],
      Home: tabs[0],
      End: tabs.at(-1),
    }[event.key];
    if (next) {
      event.preventDefault();
      selectTab(next, { focus: true, updateHash: true });
    }
  });
}

function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const name = id.startsWith("try-") ? id.slice(4) : LEGACY[id];
  const tab = name && tabs.find((t) => t.dataset.tab === name);
  if (!tab) return;
  selectTab(tab);
  $("#playground")?.scrollIntoView();
}
addEventListener("hashchange", openFromHash);
openFromHash();

/* ── Code: syntax colouring and copy buttons ─────────────────────── */
const KEYWORDS = new Set(
  "import export from function return const let await async void new type interface if else true false null undefined".split(" "),
);
const escape = (text) => text.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]);

/** A small tokenizer for the TS/TSX samples on this page. Output is escaped. */
function highlight(source) {
  const pattern = /(\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(<\/?[A-Za-z][\w.]*)|\b([A-Za-z_$][\w$]*)\b/g;
  let out = "";
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    out += escape(source.slice(last, match.index));
    const [token, comment, string, tag, word] = match;
    if (comment) out += `<span class="tok-c">${escape(comment)}</span>`;
    else if (string) out += `<span class="tok-s">${escape(string)}</span>`;
    else if (tag) out += `<span class="tok-t">${escape(tag)}</span>`;
    else if (KEYWORDS.has(word)) out += `<span class="tok-k">${word}</span>`;
    else out += escape(token);
    last = match.index + token.length;
  }
  return out + escape(source.slice(last));
}

for (const block of $$(".code")) {
  const code = $("pre code", block);
  const source = code.textContent;
  code.innerHTML = highlight(source);
  // Long lines scroll sideways: keep that reachable from the keyboard.
  const pre = code.parentElement;
  pre.tabIndex = 0;
  pre.setAttribute("aria-label", "Code sample");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.setAttribute("aria-label", "Copy code sample");
  block.prepend(button);
  wireCopyButton(button, () => source, { root: block });
}

const install = $("[data-install]");
if (install) wireCopyButton($("button", install), () => install.dataset.source, { root: install });

/* ── Tables: each cell carries its column name for the mobile layout ── */
for (const table of $$(".table-wrap table")) {
  // Wide tables scroll sideways on mid-size screens: keep that keyboard-reachable.
  const wrap = table.parentElement;
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", `${wrap.closest("section")?.querySelector("h2")?.textContent ?? "Reference"} table`);
  const heads = $$("thead th", table).map((th) => th.textContent.trim());
  for (const row of $$("tbody tr", table)) {
    [...row.cells].forEach((cell, i) => {
      if (heads[i]) cell.dataset.label = heads[i];
    });
  }
}

/* ── Docs contents, generated from the section headings ──────────── */
const toc = $("[data-toc]");
const menuDocs = $("[data-menu-docs]");
const sections = $$(".doc section[id]");
if (toc && sections.length) {
  // The same contents appear in the sidebar and, on small screens, in the header menu.
  const lists = [toc, $("ol", menuDocs ?? document.createElement("div"))].filter(Boolean);
  const links = lists.flatMap((list) =>
    sections.map((section) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#${section.id}`;
      a.textContent = $("h2", section)?.textContent ?? section.id;
      a.dataset.index = String(sections.indexOf(section));
      li.append(a);
      list.append(li);
      return a;
    }),
  );
  if (menuDocs) menuDocs.hidden = false;
  // The section being read is the last one whose top has passed the header.
  let frame = 0;
  const track = () => {
    frame = 0;
    const offset = 120;
    let current = -1;
    sections.forEach((section, i) => {
      if (section.getBoundingClientRect().top <= offset) current = i;
    });
    for (const a of links) {
      if (Number(a.dataset.index) === current) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    }
  };
  addEventListener(
    "scroll",
    () => {
      frame ||= requestAnimationFrame(track);
    },
    { passive: true },
  );
  track();
}

/* ── Release history (changelog.json, built from CHANGELOG.md) ───── */
const list = $("[data-releases]");
const KIND = { major: "Major", minor: "Minor", patch: "Patch", initial: "Initial release" };
const EXPANDED = 3;
const REPO = "https://github.com/suprabhat02/react-smart-copy";
const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setLatest(version) {
  for (const node of $$("[data-latest-version]")) node.textContent = `v${version}`;
}

function renderRelease(release, isLatest) {
  const li = el("li", "release");
  li.id = `v${release.version}`;
  li.dataset.type = release.type;
  const head = el("div", "release-head");
  const h3 = el("h3");
  const link = el("a", "", `v${release.version}`);
  link.href = `#v${release.version}`;
  h3.append(link);
  head.append(h3, el("span", "release-kind", KIND[release.type] ?? release.type));
  const time = el("time", "release-date", release.date ? dateFormat.format(new Date(release.date)) : "Publishing to npm");
  if (release.date) time.dateTime = release.date;
  else time.dataset.pendingVersion = release.version;
  head.append(time);
  if (isLatest && release.date) head.append(el("span", "release-latest", "Latest"));
  const body = el("div", "release-body");
  // Trusted: escaped and rendered at build time by scripts/changelog-parser.js.
  body.innerHTML = release.html;
  li.append(head, body);
  return li;
}

async function loadReleases() {
  try {
    const response = await fetch("./changelog.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
    const { releases } = await response.json();
    if (!Array.isArray(releases) || releases.length === 0) throw new Error("empty");
    const latest = releases.find((r) => r.date) ?? releases[0];
    setLatest(latest.version);
    const items = releases.map((r) => renderRelease(r, r === latest));
    list.replaceChildren(...items.slice(0, EXPANDED));
    if (items.length > EXPANDED) {
      const details = el("details");
      details.append(el("summary", "", `Show ${String(items.length - EXPANDED)} earlier releases`));
      const inner = el("ol", "releases");
      inner.style.border = "0";
      inner.append(...items.slice(EXPANDED));
      details.append(inner);
      const holder = el("li");
      holder.append(details);
      list.append(holder);
    }
    const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    const collapsed = target?.closest("details");
    if (collapsed) {
      collapsed.open = true;
      target.scrollIntoView();
    }
  } catch {
    const li = el("li", "releases-fallback", "Release history couldn't load. Read it on ");
    const a = el("a", "", "GitHub");
    a.href = `${REPO}/blob/main/CHANGELOG.md`;
    li.append(a, ".");
    list.replaceChildren(li);
  } finally {
    list.removeAttribute("aria-busy");
  }
}

/** A deploy can beat npm's registry by a minute: fill missing dates in the browser. */
async function fillPendingDates() {
  const pending = $$("[data-pending-version]");
  if (pending.length === 0) return;
  try {
    const response = await fetch("https://registry.npmjs.org/react-smart-copy", { headers: { accept: "application/json" } });
    if (!response.ok) return;
    const { time = {} } = await response.json();
    for (const node of pending) {
      const version = node.dataset.pendingVersion;
      const date = time[version];
      if (!date) continue;
      node.dateTime = date;
      node.textContent = dateFormat.format(new Date(date));
      delete node.dataset.pendingVersion;
      if (node.closest(".release") === $(".release", list)) {
        $(".release-latest")?.remove();
        node.after(el("span", "release-latest", "Latest"));
        setLatest(version);
      }
    }
  } catch {
    // Offline or registry blocked: the "Publishing to npm" label stays.
  }
}

if (list) void loadReleases().then(fillPendingDates);
