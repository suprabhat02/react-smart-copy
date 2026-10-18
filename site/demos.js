// Every demo on this page runs on the published library: no hand-rolled
// clipboard logic. Read this file alongside the docs below it.
import { svgToPngBlob } from "./capture.js";
import {
  applyDragCopy,
  canAcceptDrag,
  canRetryPasteState,
  createBrowserClipboardAdapter,
  createCopyCoordinator,
  createCopyMachine,
  createPasteMachine,
  describeCopyError,
  describePasteError,
  registerCopyInterceptor,
  registerDragCopy,
  resolvePasteReadOptions,
} from "./core.js";
import { htmlToMarkdown, pasteAsMarkdown } from "./markdown.js";
import { codePayload, pasteAsCode } from "./code.js";
import { clipAccept, clipPayload, defineClipFormat, readClip } from "./structured.js";
import { fromRows, parseTable, tablePayload } from "./table.js";
import {
  COPY_LABELS,
  MIN_PENDING_MS,
  PASTE_LABELS,
  PENDING_DELAY_MS,
  announce,
  createDisplayStatus,
  labelStack,
  wireCopyButton,
} from "./lib.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const plural = (n, word) => `${String(n)} ${word}${n === 1 ? "" : "s"}`;

/** Resolves after `ms`, or rejects as soon as `signal` aborts. */
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/* ── Hero: the carbon sheet ─────────────────────────────────────── */
function heroDemo() {
  const hero = $("[data-hero]");
  if (!hero) return;
  const button = $("[data-hero-copy]", hero);
  const slow = $("[data-hero-slow]", hero);
  const note = $("[data-hero-note]", hero);
  const value = $("[data-hero-value]", hero);
  const rail = (row) => $$(`[data-rail="${row}"] [data-step]`, hero);

  // A custom adapter: the real browser adapter, optionally followed by a delay
  // that honours the cancellation signal. The write itself starts synchronously.
  const browser = createBrowserClipboardAdapter();
  const adapter = {
    write: (payload, context) => {
      const written = browser.write(payload, context);
      return slow.checked ? written.then(() => delay(800, context?.signal)) : written;
    },
  };
  const machine = createCopyMachine({ adapter, resetAfterMs: 2400 });
  const setLabel = labelStack(button, COPY_LABELS);
  const light = (row, status) => {
    for (const step of rail(row)) step.toggleAttribute("data-on", step.dataset.step === status);
  };

  let startedAt = 0;
  let elapsed = null;
  let sawPending = false;
  const show = createDisplayStatus("copying", (state) => {
    hero.dataset.displayState = state;
    button.dataset.displayState = state;
    setLabel(state);
    light("shown", state);
    if (state === "copying") sawPending = true;
    if (state === "copied" && elapsed !== null) {
      const ms = elapsed < 10 ? elapsed.toFixed(1) : String(Math.round(elapsed));
      const strong = document.createElement("strong");
      strong.textContent = `${ms} ms`;
      note.replaceChildren(
        "The real copy took ",
        strong,
        sawPending
          ? `. "Copying…" appeared after ${String(PENDING_DELAY_MS)} ms, so you knew it was working, and stayed long enough to read.`
          : `. Too fast to be worth showing, so "Copying…" never flashed.`,
      );
    }
  });

  machine.subscribe(() => {
    const state = machine.getSnapshot();
    light("real", state.status);
    if (state.status === "copying") {
      startedAt = performance.now();
      elapsed = null;
      sawPending = false;
    } else if (state.status === "copied" || state.status === "error") {
      elapsed = performance.now() - startedAt;
    }
    show(state.status);
    if (state.status === "copied") announce("Copied to clipboard");
    if (state.status === "error") {
      announce(describeCopyError(state.error));
      note.textContent = describeCopyError(state.error);
    }
  });
  machine.connect();
  light("real", "idle");
  button.addEventListener("click", () => {
    void machine.copy(value.dataset.text);
  });
}

/* ── Playground: copy rows with the state tape ──────────────────── */
function drawBadge(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0073B7";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, canvas.width, canvas.height, 10);
  else ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = '600 24px "Geist Mono", ui-monospace, monospace';
  ctx.textBaseline = "middle";
  ctx.fillText("PLT-29018", 20, canvas.height / 2);
}

function sourceFor(row) {
  switch (row.dataset.kind) {
    case "html":
      return {
        kind: "html",
        html: "<b>INV-29018</b>, web design, <i>₹12,400</i>",
        text: "INV-29018, web design, ₹12,400",
      };
    case "json":
      return { kind: "json", value: { id: "CUS-77", active: true }, pretty: true };
    case "image": {
      const canvas = $("canvas", row);
      return {
        kind: "image",
        blob: () =>
          new Promise((resolve, reject) => {
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Empty canvas"))), "image/png");
          }),
      };
    }
    case "broken":
      return {
        kind: "image",
        blob: () => {
          throw new Error("Simulated tainted canvas");
        },
      };
    default:
      return row.dataset.source;
  }
}

function copyRowsDemo() {
  const tape = $("[data-tape]");
  const badges = $$("canvas[data-badge]");
  badges.forEach(drawBadge);
  document.fonts?.ready.then(() => badges.forEach(drawBadge));

  const log = (name, ms, shown, outcome) => {
    $(".empty", tape)?.remove();
    const li = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = name;
    li.append(strong, `  real: copying → ${outcome} in ${ms.toFixed(1)} ms   shown: ${shown.join(" → ")}`);
    tape.prepend(li);
    while (tape.children.length > 3) tape.lastElementChild.remove();
  };

  for (const row of $$("[data-copy-row]")) {
    let startedAt = 0;
    let shown = [];
    const button = $("button", row);
    wireCopyButton(button, () => sourceFor(row), {
      root: row,
      onState: (state) => {
        if (state.status === "copying") {
          startedAt = performance.now();
          shown = [row.dataset.displayState ?? "idle"];
        }
        if (state.status === "copied" || state.status === "error") {
          const ms = performance.now() - startedAt;
          const outcome = state.status === "copied" ? "copied" : `error (${state.error.type})`;
          // Log once the displayed state has settled too.
          setTimeout(() => log(row.dataset.name, ms, [...new Set([...shown, row.dataset.displayState])], outcome), MIN_PENDING_MS + 30);
        }
      },
    });
    new MutationObserver(() => {
      const current = row.dataset.displayState;
      if (current && shown.at(-1) !== current) shown.push(current);
    }).observe(row, { attributes: true, attributeFilter: ["data-display-state"] });
  }
}

/* ── Shared paste rendering ─────────────────────────────────────── */
function pasteMessage(state, idleHint) {
  switch (state.status) {
    case "reading":
      return "Reading the clipboard…";
    case "read": {
      const { text, images, files } = state.result;
      const parts = [];
      if (text) parts.push(plural(text.length, "character"));
      if (images.length) parts.push(plural(images.length, "image"));
      const other = files.filter((f) => !f.type.startsWith("image/")).length;
      if (other) parts.push(plural(other, "file"));
      const verb = state.result.source === "drop" ? "Dropped" : "Pasted";
      return `${verb} ${parts.join(" and ") || "content"}.`;
    }
    case "error":
      return describePasteError(state.error, state.source);
    default:
      return idleHint;
  }
}

function describeState(state) {
  if (state.status === "error") {
    return `state: error, type ${state.error.type}, source ${state.source}, retryCount ${state.retryCount}`;
  }
  if (state.status === "read") return `state: read, source ${state.result.source}`;
  return `state: ${state.status}`;
}

/* ── Playground: usePaste ───────────────────────────────────────── */
function pasteHookDemo() {
  const root = $("[data-paste-hook]");
  if (!root) return;
  const button = $("[data-paste]", root);
  const retry = $("[data-retry]", root);
  const target = $("textarea", root);
  const status = $("[data-status]", root);
  const preview = $("[data-preview]", root);
  const line = $("[data-state-line]", root);
  const idleHint = "Click Paste, or focus the box and press Ctrl+V / ⌘V.";

  const machine = createPasteMachine({ accept: ["text"], maxBytes: 1_048_576 });
  const setLabel = labelStack(button, PASTE_LABELS);
  const show = createDisplayStatus("reading", (state) => {
    button.dataset.displayState = state;
    setLabel(state);
  });

  machine.subscribe(() => {
    const state = machine.getSnapshot();
    show(state.status);
    status.dataset.state = state.status;
    status.textContent = pasteMessage(state, idleHint);
    line.textContent = describeState(state);
    retry.hidden = !canRetryPasteState(state);
    if (state.status === "read") {
      const text = state.result.text ?? "";
      preview.textContent = text.length > 600 ? `${text.slice(0, 600)}…` : text;
      preview.removeAttribute("data-empty");
      announce("Pasted from clipboard");
    }
    if (state.status === "error") announce(describePasteError(state.error));
  });
  machine.connect();
  status.textContent = idleHint;
  line.textContent = describeState(machine.getSnapshot());

  button.addEventListener("click", () => {
    void machine.paste();
  });
  retry.addEventListener("click", () => {
    void machine.retry();
  });
  // The machine calls preventDefault() only when the event carries accepted content.
  target.addEventListener("paste", (event) => {
    void machine.pasteEvent(event);
  });
}

/* ── Playground: PasteField ─────────────────────────────────────── */
function pasteFieldDemo() {
  const root = $("[data-paste-field]");
  if (!root) return;
  const zone = $("[data-zone]", root);
  const trigger = $("[data-trigger]", root);
  const retry = $("[data-retry]", root);
  const clear = $("[data-clear]", root);
  const status = $("[data-status]", root);
  const preview = $("[data-preview]", root);
  const line = $("[data-state-line]", root);
  const placeholder = "Nothing pasted yet. Try a screenshot.";

  const options = { accept: ["text", "image"] };
  const machine = createPasteMachine(options);
  const setLabel = labelStack(trigger, PASTE_LABELS);
  let urls = [];
  const revoke = () => {
    for (const url of urls) URL.revokeObjectURL(url);
    urls = [];
  };

  const show = createDisplayStatus("reading", (state) => {
    for (const el of [root, zone, trigger]) el.dataset.displayState = state;
    setLabel(state);
  });

  const renderPreview = (state) => {
    revoke();
    if (state.status !== "read") {
      preview.replaceChildren(placeholder);
      preview.setAttribute("data-empty", "");
      return;
    }
    // Like PasteField.Preview: text as text (never HTML), thumbnails, file names.
    const { text, images, files } = state.result;
    const parts = [];
    if (text) {
      const pre = document.createElement("pre");
      pre.textContent = text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
      parts.push(pre);
    }
    images.forEach((blob, index) => {
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const img = document.createElement("img");
      img.src = url;
      img.alt = `Pasted image ${String(index + 1)} of ${String(images.length)}`;
      parts.push(img);
    });
    const other = files.filter((f) => !f.type.startsWith("image/"));
    if (other.length) {
      const ul = document.createElement("ul");
      for (const file of other) {
        const li = document.createElement("li");
        li.textContent = file.name;
        ul.append(li);
      }
      parts.push(ul);
    }
    preview.replaceChildren(...parts);
    preview.removeAttribute("data-empty");
  };

  machine.subscribe(() => {
    const state = machine.getSnapshot();
    root.dataset.state = state.status;
    show(state.status);
    status.dataset.state = state.status;
    status.textContent = pasteMessage(state, "Ready");
    line.textContent = describeState(state);
    retry.hidden = !canRetryPasteState(state);
    trigger.setAttribute("aria-busy", String(state.status === "reading"));
    if (state.status !== "reading") renderPreview(state);
    if (state.status === "read") {
      announce(state.result.source === "drop" ? "Dropped content added" : "Pasted from clipboard");
    }
    if (state.status === "error") {
      const message = describePasteError(state.error, state.source);
      announce(message);
      preview.replaceChildren(message);
    }
  });
  machine.connect();
  renderPreview(machine.getSnapshot());
  line.textContent = describeState(machine.getSnapshot());

  trigger.addEventListener("click", () => {
    void machine.paste();
  });
  retry.addEventListener("click", () => {
    void machine.retry();
  });
  clear.addEventListener("click", () => {
    machine.reset(); // also aborts a read in flight
  });
  zone.addEventListener("paste", (event) => {
    void machine.pasteEvent(event);
  });

  // Drag-and-drop, as PasteField.Zone wires it: only accepted drags get the
  // drop cursor, and a depth count keeps the highlight steady over children.
  const resolved = resolvePasteReadOptions(options);
  let depth = 0;
  const setOver = (on) => zone.toggleAttribute("data-drag-over", on);
  zone.addEventListener("dragenter", (event) => {
    depth += 1;
    if (event.dataTransfer && canAcceptDrag(event.dataTransfer, resolved)) setOver(true);
  });
  zone.addEventListener("dragover", (event) => {
    if (!event.dataTransfer) return;
    // Always claimed, so a rejected file is cancelled instead of opened in place of the page.
    event.preventDefault();
    event.dataTransfer.dropEffect = canAcceptDrag(event.dataTransfer, resolved) ? "copy" : "none";
  });
  zone.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) setOver(false);
  });
  zone.addEventListener("drop", (event) => {
    depth = 0;
    setOver(false);
    void machine.dropEvent(event);
  });
}

/* ── Playground: CopyGroup ──────────────────────────────────────── */
function copyGroupDemo() {
  const coordinator = createCopyCoordinator();
  for (const row of $$("[data-group-row]")) {
    const machine = createCopyMachine({ coordinator });
    wireCopyButton($("button", row), () => row.dataset.source, { root: row, machine });
  }
}

/* ── Playground: capture ────────────────────────────────────────── */
function captureDemo() {
  const root = $("[data-capture]");
  if (!root) return;
  const svg = $("svg", root);
  const status = $("[data-status]", root);
  const MESSAGES = {
    idle: "",
    copying: "Rasterising the SVG…",
    copied: "PNG copied. Paste it into Figma, Slack or a doc.",
  };
  wireCopyButton(
    $("[data-capture-copy]", root),
    // The lazy source runs inside the click; the signal stops rasterising on reset.
    () => ({ kind: "image", blob: (context) => svgToPngBlob(svg, { scale: 2, signal: context?.signal }) }),
    {
      root,
      onState: (state) => {
        status.dataset.state = state.status;
        status.textContent = state.status === "error" ? describeCopyError(state.error) : MESSAGES[state.status];
      },
    },
  );
}

/* ── Playground: native copy interception ───────────────────────── */
function interceptDemo() {
  const root = $("[data-intercept]");
  if (!root) return;
  const toggle = $("[data-intercept-toggle]", root);
  const status = $("[data-ix-status]", root);
  const out = $("[data-ix-out]", root);
  const zone = (name) => $(`[data-ix-zone="${name}"]`, root);
  const SOURCE = "https://suprabhat02.github.io/react-smart-copy/";

  /** Serialises a (mutated) fragment back to HTML. */
  const toHtml = (fragment) => {
    const box = document.createElement("div");
    box.append(fragment);
    return box.innerHTML;
  };

  const redaction = zone("redaction");
  const secretAround = (node) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest("[data-redact]");

  const scopes = [
    {
      name: "Attribution",
      root: zone("attribution"),
      options: {
        // Attribution is a nicety: if it ever broke, let the normal copy through.
        failureMode: "native",
        transform: ({ text }) => `${text.trim()}\n\nSource: ${SOURCE}`,
      },
    },
    {
      name: "Redaction",
      root: redaction,
      options: {
        // Wins any selection that touches it, so masking can't be bypassed from above.
        priority: 10,
        transform: ({ text, fragment }) => {
          // Inside the input we can't tell which part is secret: mask it all.
          if (!fragment) return "[redacted]";
          // A selection entirely inside one secret clones to bare text, with no marker left.
          const selection = document.getSelection();
          const within = secretAround(selection?.anchorNode);
          if (within && within === secretAround(selection?.focusNode)) return "••••";
          // Partially selected secrets are cloned with their marker, holding only the selected part.
          let masked = text;
          for (const node of fragment.querySelectorAll("[data-redact]")) {
            if (node.textContent) masked = masked.split(node.textContent).join("••••");
            node.textContent = "••••";
          }
          return { kind: "html", html: toHtml(fragment), text: masked };
        },
      },
    },
    {
      name: "Spreadsheet",
      root: zone("table"),
      options: {
        transform: ({ fragment }) => {
          const rows = fragment ? [...fragment.querySelectorAll("tr")] : [];
          // Text inside a single cell: the browser's own copy is already right.
          if (rows.length === 0) return undefined;
          const cells = (row) => [...row.children].map((cell) => cell.textContent.trim());
          const tsv = rows.map((row) => cells(row).join("\t")).join("\n");
          const html = `<table>${rows.map((row) => row.outerHTML).join("")}</table>`;
          return { kind: "multi", items: [{ mimeType: "text/plain", data: tsv }, { mimeType: "text/html", data: html }] };
        },
      },
    },
    { name: "No-copy zone", root: zone("blocked"), options: { transform: () => false } },
  ];

  const flash = (element, state) => {
    element.dataset.displayState = state;
    clearTimeout(element.flashTimer);
    element.flashTimer = setTimeout(() => delete element.dataset.displayState, 1600);
  };

  const describePayload = (payload) => {
    switch (payload.kind) {
      case "text":
        return { types: ["text/plain"], text: payload.value };
      case "html":
        return { types: ["text/html", "text/plain"], text: payload.text };
      case "multi":
        return {
          types: payload.items.map((item) => item.mimeType),
          text: payload.items.find((item) => item.mimeType === "text/plain")?.data ?? "",
        };
      default:
        return { types: ["text/plain"], text: JSON.stringify(payload.value, null, 2) };
    }
  };

  const show = (scope, outcome) => {
    const verb = outcome.selection?.kind === "cut" ? "Cut" : "Copy";
    status.dataset.state = outcome.status === "written" ? "copied" : outcome.status === "failed" ? "error" : "";
    out.hidden = true;
    switch (outcome.status) {
      case "written": {
        const { types, text } = describePayload(outcome.payload);
        const deleted = outcome.deleted ? " The selection was removed, and undo brings it back." : "";
        status.textContent = `${verb} rewritten by ${scope.name}: ${types.join(" + ")}.${deleted}`;
        out.textContent = text;
        out.hidden = false;
        flash(scope.root, "copied");
        announce(`${verb} rewritten by ${scope.name}`);
        break;
      }
      case "blocked":
        status.textContent = `${verb} blocked by ${scope.name}. Nothing reached the clipboard.`;
        flash(scope.root, "blocked");
        announce(`${verb} blocked`);
        break;
      case "failed":
        status.textContent = `${scope.name} failed (${outcome.error.type}), so the copy was ${outcome.fallback === "block" ? "blocked" : "left as is"}.`;
        flash(scope.root, "error");
        announce(describeCopyError(outcome.error));
        break;
      default:
        status.textContent = `${scope.name} left this ${verb.toLowerCase()} to the browser (${outcome.reason}).`;
    }
  };

  let stops = [];
  const enable = () => {
    stops = scopes.map((scope) => registerCopyInterceptor(scope.root, { ...scope.options, onIntercept: (outcome) => show(scope, outcome) }));
    root.dataset.intercepting = "";
    status.dataset.state = "";
    status.textContent = "Interception is on. Copy something above.";
    out.hidden = true;
  };
  const disable = () => {
    for (const stop of stops) stop();
    stops = [];
    delete root.dataset.intercepting;
    status.dataset.state = "";
    status.textContent = "Interception is off: your browser copies normally. Compare what you paste.";
    out.hidden = true;
  };

  toggle.addEventListener("change", () => (toggle.checked ? enable() : disable()));
  enable();
  status.textContent = "Nothing copied yet.";
}

/* ── Playground: useDragCopy ─────────────────────────────────────── */
function dragCopyDemo() {
  const root = $("[data-drag-demo]");
  if (!root) return;

  const statusEl = $("[data-drag-status]", root);
  const dropZone = $("[data-drag-drop-zone]", root);
  const dropText = $("[data-drag-drop-text]", root);

  /** Build the source for a given card kind. */
  function sourceFor(kind) {
    switch (kind) {
      case "text":
        return "INV-29018, DesignCo, ₹12,400";
      case "html":
        return {
          kind: "html",
          html: "<b>INV-29018</b>, DesignCo, <i>₹12,400</i>",
          text: "INV-29018, DesignCo, ₹12,400",
        };
      case "json":
        return {
          kind: "json",
          value: { id: "INV-29018", client: "DesignCo", amount: 12400 },
          pretty: true,
        };
      case "cancel":
        return false;
      default:
        return null;
    }
  }

  /** Update the status line describing the last drag outcome. */
  function showOutcome(kind, outcome) {
    let msg;
    if (outcome.status === "written") {
      const label = outcome.payload.kind ?? "text";
      msg = `✓ Drag started (${kind}). Written as ${label} payload.`;
    } else if (outcome.status === "passed" && outcome.reason === "cancelled") {
      msg = "✕ Drag cancelled — source returned false, nothing dragged.";
    } else if (outcome.status === "passed") {
      msg = `— Drag passed through (${outcome.reason}).`;
    } else {
      msg = `✕ Error: ${outcome.error.message}`;
    }
    statusEl.textContent = msg;
  }

  // Wire each card with registerDragCopy.
  for (const card of $$("[data-drag-card]", root)) {
    const kind = card.dataset.kind;
    registerDragCopy(card, () => ({
      source: () => sourceFor(kind),
      effectAllowed: "copy",
      onDrag: (state) => {
        if (state.status === "dragging" && state.outcome) {
          showOutcome(kind, state.outcome);
          if (state.outcome.status === "written") card.setAttribute("data-dragging", "");
        }
        if (state.status === "done") card.removeAttribute("data-dragging");
      },
    }));
  }

  // Drop zone: accept text/plain and text/html from our cards.
  let dropDepth = 0;
  dropZone.addEventListener("dragenter", (event) => {
    dropDepth += 1;
    if (event.dataTransfer?.types.includes("text/plain")) {
      dropZone.setAttribute("data-over", "");
    }
  });
  dropZone.addEventListener("dragover", (event) => {
    if (!event.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  dropZone.addEventListener("dragleave", () => {
    dropDepth = Math.max(0, dropDepth - 1);
    if (dropDepth === 0) dropZone.removeAttribute("data-over");
  });
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropDepth = 0;
    dropZone.removeAttribute("data-over");
    const dt = event.dataTransfer;
    if (!dt) return;
    const html = dt.getData("text/html");
    const text = dt.getData("text/plain");
    if (html) {
      const preview = document.createElement("div");
      preview.innerHTML = html; // safe: our own HTML from the source above
      dropText.textContent = `Dropped HTML (as text): ${preview.textContent}`;
    } else if (text) {
      dropText.textContent = `Dropped text: ${text}`;
    } else {
      dropText.textContent = "Dropped, but no text/plain or text/html found.";
    }
    announce("Dropped content received");
  });
}

/* ── Playground: tables for Excel and Sheets ─────────────────────── */
function tablesDemo() {
  const root = $("[data-tables]");
  if (!root) return;
  const count = $("[data-tb-count]", root);
  const zone = $("[data-tb-zone]", root);
  const status = $("[data-tb-status]", root);
  const preview = $("[data-tb-preview]", root);
  const boxes = $$("[data-tb-row] input[type=checkbox]", root);

  const invoices = [
    { id: "INV-29018", client: "DesignCo", po: "004512", amount: 12400, due: "2026-11-01" },
    { id: "INV-29019", client: "Northwind & Sons", po: "004513", amount: 8950.5, due: "2026-11-15" },
    { id: "INV-29020", client: '=HYPERLINK("evil")', po: "004514", amount: -250, due: "2026-12-01" },
  ];
  const columns = [
    { header: "Invoice", value: "id" },
    { header: "Client", value: "client" },
    { header: "PO", value: "po" },
    { header: "Amount", value: "amount" },
    { header: "Due", value: "due" },
  ];
  const chosen = () => {
    const picked = invoices.filter((_, index) => boxes[index]?.checked);
    return picked.length > 0 ? picked : invoices;
  };
  const describeSelection = () => {
    const picked = boxes.filter((box) => box.checked).length;
    count.textContent =
      picked === 0 ? "No rows selected: all rows will be copied." : `${plural(picked, "row")} selected.`;
  };
  for (const box of boxes) box.addEventListener("change", describeSelection);

  // Lazy source: built inside the click, from the selection at that moment.
  wireCopyButton($("[data-tb-copy]", root), () => () => tablePayload(fromRows(chosen(), columns)), { root });

  // Paste: the paste event carries both flavours; parseTable prefers the HTML table.
  const machine = createPasteMachine({ accept: ["html", "text"] });
  const render = (table) => {
    const head = document.createElement("thead");
    const body = document.createElement("tbody");
    const row = (cells, tag) => {
      const tr = document.createElement("tr");
      for (const text of cells) {
        const cell = document.createElement(tag);
        cell.textContent = text; // Pasted content is untrusted: text only, never HTML.
        tr.append(cell);
      }
      return tr;
    };
    if (table.headers) head.append(row(table.headers, "th"));
    for (const cells of table.rows.slice(0, 20)) body.append(row(cells, "td"));
    const element = document.createElement("table");
    element.className = "tb-table";
    if (table.headers) element.append(head);
    element.append(body);
    preview.replaceChildren(element);
    preview.hidden = false;
  };
  machine.subscribe(() => {
    const state = machine.getSnapshot();
    if (state.status === "error") {
      status.dataset.state = "error";
      status.textContent = describePasteError(state.error, state.source);
      return;
    }
    if (state.status !== "read") return;
    const table = parseTable(state.result, { headers: "auto" });
    if (!table) {
      status.dataset.state = "error";
      status.textContent = "That paste didn't contain a table. Copy a range of cells and try again.";
      preview.hidden = true;
      return;
    }
    const shown = table.rows.length > 20 ? " The first 20 rows are shown." : "";
    status.dataset.state = "read";
    status.textContent =
      `${plural(table.rows.length, "row")} × ${plural(table.columnCount, "column")}, read from ` +
      `${table.source === "html" ? "the HTML table" : "the tab-separated text"}.${table.truncated ? " Some content was over the limits and left out." : ""}${shown}`;
    render(table);
    announce(`Pasted ${plural(table.rows.length, "row")}`);
  });
  machine.connect();
  zone.addEventListener("paste", (event) => {
    void machine.pasteEvent(event);
  });
}

/* ── Playground: structured data ─────────────────────────────────── */

/**
 * The schema for pasted cards: a plain validator, since this page has no build step.
 * In an app, a Zod / Valibot / ArkType schema does the same job. It returns fresh
 * objects with only the known keys, so nothing unexpected rides along.
 */
function parseCards(data) {
  if (!Array.isArray(data) || data.length === 0 || data.length > 100) {
    throw new TypeError("Expected a list of 1 to 100 cards.");
  }
  return data.map((card, index) => {
    const where = `Card ${String(index + 1)}`;
    if (typeof card !== "object" || card === null) throw new TypeError(`${where} is not an object.`);
    const { title, owner, points, tags } = card;
    if (typeof title !== "string" || title.length === 0 || title.length > 120) {
      throw new TypeError(`${where}: the title must be 1 to 120 characters.`);
    }
    if (typeof owner !== "string" || owner.length === 0 || owner.length > 60) {
      throw new TypeError(`${where}: the owner must be 1 to 60 characters.`);
    }
    if (!Number.isInteger(points) || points < 0 || points > 100) {
      throw new TypeError(`${where}: points must be a whole number from 0 to 100.`);
    }
    if (!Array.isArray(tags) || tags.length > 10 || !tags.every((tag) => typeof tag === "string" && tag.length <= 30)) {
      throw new TypeError(`${where}: tags must be up to 10 short strings.`);
    }
    return { title, owner, points, tags: [...tags] };
  });
}

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const describeCard = (card) => `${card.owner} · ${plural(card.points, "pt")}${card.tags.length > 0 ? ` · ${card.tags.join(", ")}` : ""}`;

const Cards = defineClipFormat({
  id: "rsc-demo.cards",
  version: 2,
  schema: parseCards,
  // Version 1 had no tags. Data copied from an older deployment still pastes.
  migrate: { 1: (cards) => (Array.isArray(cards) ? cards.map((card) => ({ ...card, tags: [] })) : cards) },
  text: (cards) => cards.map((card) => `• ${card.title} (${describeCard(card)})`).join("\n"),
  html: (cards) => `<ul>${cards.map((card) => `<li><b>${escapeHtml(card.title)}</b>, ${escapeHtml(describeCard(card))}</li>`).join("")}</ul>`,
});

/** The same format written by a careless (or hostile) app: no validation on its side. */
const CarelessCards = defineClipFormat({ id: Cards.id, version: Cards.version, schema: (data) => data });

const CARRIER_NAMES = {
  web: "the web custom format",
  custom: "the custom clipboard type",
  html: "the hidden HTML envelope",
};

function structuredDemo() {
  const root = $("[data-structured]");
  if (!root) return;
  const count = $("[data-st-count]", root);
  const zone = $("[data-st-zone]", root);
  const status = $("[data-st-status]", root);
  const backlog = $("[data-st-backlog]", root);
  const items = $$("[data-st-card]", root);
  const boxes = items.map((item) => $("input[type=checkbox]", item));

  const cards = [
    { title: "Ship the structured clipboard", owner: "Shubh", points: 5, tags: ["api", "docs"] },
    { title: 'Audit paste limits & "edge cases"', owner: "Asha", points: 3, tags: ["security"] },
    { title: "Translate the error messages", owner: "Lin", points: 2, tags: ["i18n"] },
  ];
  const selected = () => cards.filter((_, index) => boxes[index]?.checked);
  const chosen = () => (selected().length > 0 ? selected() : cards);
  const describeSelection = () => {
    const picked = selected().length;
    count.textContent = picked === 0 ? "No cards selected: all cards will be copied." : `${plural(picked, "card")} selected.`;
  };
  for (const box of boxes) box.addEventListener("change", describeSelection);

  // Copy: the payload is built inside the click, from the selection at that moment.
  wireCopyButton($("[data-st-copy]", root), () => () => clipPayload(Cards, chosen()), {
    root,
    labels: { idle: "Copy cards", copying: "Copying…", copied: "Copied", error: "Retry" },
  });
  wireCopyButton(
    $("[data-st-tampered]", root),
    () => () => clipPayload(CarelessCards, [{ title: '<img src=x onerror="alert(1)">', owner: "mallory", points: "lots", tags: [] }]),
    { labels: { idle: "Copy a tampered clip", copying: "Copying…", copied: "Copied", error: "Retry" } },
  );

  // Drag: a card drags the selection when it is part of it, otherwise itself.
  items.forEach((item, index) => {
    item.draggable = true;
    registerDragCopy(item, () => ({
      source: () => clipPayload(Cards, boxes[index]?.checked ? selected() : [cards[index]]),
      effectAllowed: "copy",
    }));
  });

  // Paste: Ctrl/⌘+V, drops and the Paste button all feed one paste machine.
  const options = { accept: [...clipAccept(Cards), "text"] };
  const machine = createPasteMachine(options);
  const setStatus = (state, text) => {
    status.dataset.state = state;
    status.textContent = text;
  };
  const addToBacklog = (pasted) => {
    for (const card of pasted) {
      const li = document.createElement("li");
      li.className = "st-card";
      const title = document.createElement("span");
      title.className = "st-title";
      title.textContent = card.title; // Text only: pasted data never becomes markup.
      const meta = document.createElement("span");
      meta.className = "st-meta";
      meta.textContent = describeCard(card);
      li.append(title, meta);
      backlog.append(li);
    }
    backlog.hidden = false;
  };

  machine.subscribe(() => {
    const state = machine.getSnapshot();
    if (state.status === "error") {
      setStatus("error", describePasteError(state.error, state.source));
      return;
    }
    if (state.status !== "read") return;
    const result = state.result;
    void readClip(result, Cards).then((clip) => {
      switch (clip.status) {
        case "ok": {
          addToBacklog(clip.value);
          const migrated = clip.version < Cards.version ? ` Migrated from version ${String(clip.version)}.` : "";
          setStatus("read", `Added ${plural(clip.value.length, "card")}, read from ${CARRIER_NAMES[clip.carrier]}.${migrated}`);
          announce(`Added ${plural(clip.value.length, "card")}`);
          break;
        }
        case "invalid":
          setStatus("error", `Rejected: ${clip.issues[0]?.message ?? "the data is invalid."} Nothing was added.`);
          announce("Paste rejected");
          break;
        case "unsupported-version":
          setStatus("error", `These cards come from a newer version of this page (version ${String(clip.version)}). Reload to paste them.`);
          break;
        case "absent":
          setStatus(
            "error",
            result.text
              ? "That paste held plain text, not cards. Copy cards above, or from another tab of this page."
              : "That paste had no cards. Copy cards above, or from another tab of this page.",
          );
          break;
      }
    });
  });
  machine.connect();

  $("[data-st-paste]", root).addEventListener("click", () => {
    void machine.paste();
  });
  zone.addEventListener("paste", (event) => {
    void machine.pasteEvent(event);
  });
  const resolved = resolvePasteReadOptions(options);
  let depth = 0;
  const setOver = (on) => zone.toggleAttribute("data-drag-over", on);
  zone.addEventListener("dragenter", (event) => {
    depth += 1;
    if (event.dataTransfer && canAcceptDrag(event.dataTransfer, resolved)) setOver(true);
  });
  zone.addEventListener("dragover", (event) => {
    if (!event.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canAcceptDrag(event.dataTransfer, resolved) ? "copy" : "none";
  });
  zone.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) setOver(false);
  });
  zone.addEventListener("drop", (event) => {
    depth = 0;
    setOver(false);
    void machine.dropEvent(event);
  });
}

/* ── Playground: paste as Markdown ───────────────────────────────── */
function markdownDemo() {
  const root = $("[data-markdown]");
  if (!root) return;
  const sample = $("[data-md-sample]", root);
  const editor = $("[data-md-editor]", root);
  const status = $("[data-md-status]", root);

  // The sample as rich text (what copying from a web page puts on the clipboard).
  wireCopyButton($("[data-md-copy-rich]", root), () => () => ({ kind: "html", html: sample.innerHTML, text: sample.innerText }), {
    labels: { idle: "Copy as rich text", copying: "Copying…", copied: "Copied", error: "Retry" },
  });
  // Or straight as Markdown: the converter also takes a DOM node.
  wireCopyButton($("[data-md-copy-md]", root), () => () => htmlToMarkdown(sample).markdown, {
    labels: { idle: "Copy as Markdown", copying: "Copying…", copied: "Copied", error: "Retry" },
  });

  editor.addEventListener("paste", (event) => {
    const converted = pasteAsMarkdown(event);
    status.dataset.state = "read";
    status.textContent = converted
      ? "Converted rich text to Markdown. Ctrl/⌘+Z undoes it."
      : "Pasted as it is: plain text and code are left untouched.";
    announce(converted ? "Pasted as Markdown" : "Pasted");
  });
}

/* ── Playground: copy and paste code ─────────────────────────────── */
/**
 * Trojan Source (the comment hides the end of the string), a Cyrillic "а" in an
 * identifier and curly quotes, written as escapes so this file holds none of them.
 */
const SUSPICIOUS_CODE = [
  "if (\u0430ccessLevel != \"user\u202E \u2066// admins only\u2069 \u2066\") {",
  "  log(\u201Cdenied\u201D);",
  "}",
].join("\n");

function codeDemo() {
  const root = $("[data-code]");
  if (!root) return;
  const session = $("[data-cd-session]", root);
  const preview = $("[data-cd-preview]", root);
  const editor = $("[data-cd-editor]", root);
  const status = $("[data-cd-status]", root);
  const list = $("[data-cd-findings]", root);

  wireCopyButton(
    $("[data-cd-copy]", root),
    () => () => {
      const payload = codePayload(session, { language: "sh" });
      preview.textContent = payload.kind === "html" ? payload.text : payload.value;
      return payload;
    },
    { labels: { idle: "Copy", copying: "Copying…", copied: "Copied", error: "Retry" } },
  );
  wireCopyButton($("[data-cd-copy-suspicious]", root), () => SUSPICIOUS_CODE, {
    labels: { idle: "Copy the snippet", copying: "Copying…", copied: "Copied", error: "Retry" },
  });

  editor.addEventListener("paste", (event) => {
    let seen = null;
    const handled = pasteAsCode(event, {
      onPaste: (result) => {
        seen = result;
      },
    });
    list.replaceChildren();
    if (!handled || seen === null) {
      status.textContent = "Pasted as it is.";
      return;
    }
    status.dataset.state = seen.danger ? "error" : "read";
    const dangers = seen.findings.filter((finding) => finding.severity === "danger").length;
    status.textContent =
      seen.findings.length === 0
        ? "Pasted. Nothing suspicious in it."
        : `Pasted. Fixed ${seen.fixed} character${seen.fixed === 1 ? "" : "s"}${dangers > 0 ? `, ${dangers} of them dangerous` : ""}${seen.remaining.length > 0 ? `; ${seen.remaining.length} left as they were` : ""}.`;
    for (const finding of seen.findings) {
      const item = document.createElement("li");
      item.dataset.severity = finding.severity;
      const where = document.createElement("span");
      where.className = "cd-where";
      where.textContent = `${finding.line}:${finding.column}`;
      const what = document.createElement("span");
      what.textContent = `${finding.label} (${finding.kind}, ${finding.severity})`;
      item.append(where, what);
      list.append(item);
    }
    announce(seen.danger || dangers > 0 ? "Pasted. Dangerous characters were found and removed." : "Pasted");
  });
}

heroDemo();
copyRowsDemo();
pasteHookDemo();
pasteFieldDemo();
copyGroupDemo();
captureDemo();
interceptDemo();
dragCopyDemo();
tablesDemo();
structuredDemo();
markdownDemo();
codeDemo();
