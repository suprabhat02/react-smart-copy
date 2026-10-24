// Every demo runs on the published library: no hand-rolled clipboard logic. Each docs page
// imports only the demo it shows; the rest is tree-shaken away.
import { svgToPngBlob } from "react-smart-copy/capture";
import {
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
} from "react-smart-copy/core";
import { htmlToMarkdown, pasteAsMarkdown } from "react-smart-copy/markdown";
import { codePayload, pasteAsCode } from "react-smart-copy/code";
import { prepareImage } from "react-smart-copy/image";
import { linkPayload, pasteAsLink, selectionLink } from "react-smart-copy/link";
import { describeShareError, shareMethod, shareOrCopy } from "react-smart-copy/share";
import { colorPayload, contrastLevel, contrastRatio, formatColor, parseColor, pasteAsColor } from "react-smart-copy/color";
import { pasteAsRich, prepareRich, richTransform } from "react-smart-copy/rich";
import { acceptFiles, formatBytes } from "react-smart-copy/files";
import { pasteWithoutSecrets, redactSecrets, scanSecrets, secretRedactor } from "react-smart-copy/secrets";
import { createOtpField, extractOtp } from "react-smart-copy/otp";
import { formatNumber, parseNumber, pasteAsNumber } from "react-smart-copy/number";
import { clipAccept, clipPayload, defineClipFormat, readClip } from "react-smart-copy/structured";
import { fromRows, parseTable, tablePayload } from "react-smart-copy/table";
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
// A photo with EXIF metadata, GPS included: bundled, so its URL is right on every page.
import samplePhoto from "./sample-photo.jpg?url";

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
export function heroDemo() {
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

export function copyRowsDemo() {
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
export function pasteHookDemo() {
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
export function pasteFieldDemo() {
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
export function copyGroupDemo() {
  const coordinator = createCopyCoordinator();
  for (const row of $$("[data-group-row]")) {
    const machine = createCopyMachine({ coordinator });
    wireCopyButton($("button", row), () => row.dataset.source, { root: row, machine });
  }
}

/* ── Playground: capture ────────────────────────────────────────── */
export function captureDemo() {
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
export function interceptDemo() {
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
export function dragCopyDemo() {
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
    // Anything can be dropped here, from any site: show its plain text, never its markup.
    const text = dt.getData("text/plain");
    const hasHtml = dt.types.includes("text/html");
    if (text) {
      dropText.textContent = `Dropped ${hasHtml ? "HTML, shown as its plain text" : "text"}: ${text}`;
    } else if (hasHtml) {
      dropText.textContent = "Dropped HTML without a plain-text version. It is not rendered here.";
    } else {
      dropText.textContent = "Dropped, but no text/plain or text/html found.";
    }
    announce("Dropped content received");
  });
}

/* ── Playground: tables for Excel and Sheets ─────────────────────── */
export function tablesDemo() {
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

const Cards = /* @__PURE__ */ defineClipFormat({
  id: "rsc-demo.cards",
  version: 2,
  schema: parseCards,
  // Version 1 had no tags. Data copied from an older deployment still pastes.
  migrate: { 1: (cards) => (Array.isArray(cards) ? cards.map((card) => ({ ...card, tags: [] })) : cards) },
  text: (cards) => cards.map((card) => `• ${card.title} (${describeCard(card)})`).join("\n"),
  html: (cards) => `<ul>${cards.map((card) => `<li><b>${escapeHtml(card.title)}</b>, ${escapeHtml(describeCard(card))}</li>`).join("")}</ul>`,
});

/** The same format written by a careless (or hostile) app: no validation on its side. */
const CarelessCards = /* @__PURE__ */ defineClipFormat({ id: Cards.id, version: Cards.version, schema: (data) => data });

const CARRIER_NAMES = {
  web: "the web custom format",
  custom: "the custom clipboard type",
  html: "the hidden HTML envelope",
};

export function structuredDemo() {
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
export function markdownDemo() {
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

export function codeDemo() {
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

/* ── Playground: pasted images ───────────────────────────────────── */
const METADATA_LABELS = {
  exif: "Camera, settings and dates (Exif)",
  gps: "GPS location",
  thumbnail: "Embedded preview image",
  xmp: "Edit history and authors (XMP)",
  iptc: "Captions and credits (IPTC)",
  comment: "Comments",
  text: "Text notes",
  icc: "Colour profile",
  other: "Other hidden data",
};

const kb = (bytes) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`);

export function imagesDemo() {
  const root = $("[data-images]");
  if (!root) return;
  const zone = $("[data-img-zone]", root);
  const status = $("[data-img-status]", root);
  const result = $("[data-img-result]", root);
  const preview = $("[data-img-preview]", root);
  const rows = $("[data-img-rows]", root);
  const removedList = $("[data-img-removed]", root);
  const download = $("[data-img-download]", root);
  const width = $("[data-img-width]", root);
  const bytes = $("[data-img-bytes]", root);
  let current = null;
  let url = null;
  let run = 0;

  async function show(file) {
    current = file;
    const id = (run += 1);
    status.dataset.state = "reading";
    status.textContent = "Preparing the image…";
    try {
      const options = {};
      if (width.value) options.maxWidth = Number(width.value);
      if (bytes.value) options.maxBytes = Number(bytes.value);
      const image = await prepareImage(file, options);
      if (id !== run) return;
      const { info, size } = image.original;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(image.file);
      preview.src = url;
      download.href = url;
      download.download = image.file.name ?? `image.${image.type.split("/")[1]}`;
      const metadata = (kinds) => (kinds.length === 0 ? "None" : kinds.map((kind) => METADATA_LABELS[kind]).join(", "));
      const swapped = info.orientation >= 5 && (info.format === "jpeg" || info.format === "png");
      const before = info.width === null ? "Unknown" : swapped ? `${info.height} × ${info.width}` : `${info.width} × ${info.height}`;
      const after = image.width === null ? before : `${image.width} × ${image.height}`;
      const kept = info.metadata.filter((kind) => !image.removed.includes(kind));
      const table = [
        ["Format", info.mimeType ?? file.type ?? "Unknown", image.type],
        ["Pixels", before, after],
        ["File size", kb(size), kb(image.size)],
        ["Metadata", metadata(info.metadata), metadata(kept)],
      ];
      rows.replaceChildren(
        ...table.map(([label, was, now]) => {
          const tr = document.createElement("tr");
          const th = document.createElement("th");
          th.scope = "row";
          th.textContent = label;
          const a = document.createElement("td");
          a.textContent = was;
          const b = document.createElement("td");
          b.textContent = now;
          if (label !== "Metadata") {
            a.className = "short";
            b.className = "short";
          }
          tr.append(th, a, b);
          return tr;
        }),
      );
      removedList.replaceChildren(
        ...(image.removed.length === 0 ? ["Nothing: it carried no metadata."] : image.removed.map((kind) => METADATA_LABELS[kind])).map((text) => {
          const li = document.createElement("li");
          li.textContent = text;
          return li;
        }),
      );
      result.hidden = false;
      status.dataset.state = "read";
      status.textContent = image.reencoded
        ? `Re-encoded as ${image.type.split("/")[1].toUpperCase()}${image.quality === null ? "" : ` at quality ${Math.round(image.quality * 100)}`}${image.resized ? ", made smaller" : ""}.`
        : "Metadata removed without re-encoding: every pixel is unchanged.";
      announce(image.removed.includes("gps") ? "Image ready. Its GPS location was removed." : "Image ready.");
    } catch (error) {
      if (id !== run) return;
      result.hidden = true;
      status.dataset.state = "error";
      status.textContent = error?.copyError?.type === "too-large"
        ? "This image can't fit those limits. Try a larger file size or width."
        : error?.copyError?.type === "unsupported-format"
          ? "That file isn't an image this browser can read."
          : "The image couldn't be prepared.";
      announce(status.textContent);
    }
  }

  const imageFrom = (list) => [...(list ?? [])].find((file) => file.type.startsWith("image/")) ?? null;

  $("[data-img-sample]", root).addEventListener("click", async () => {
    const response = await fetch(samplePhoto);
    void show(new File([await response.blob()], "sample-photo.jpg", { type: "image/jpeg", lastModified: Date.now() }));
  });
  $("[data-img-file]", root).addEventListener("change", (event) => {
    const file = imageFrom(event.target.files);
    if (file) void show(file);
    event.target.value = "";
  });
  zone.addEventListener("paste", (event) => {
    const file = imageFrom(event.clipboardData?.files);
    if (!file) {
      status.dataset.state = "error";
      status.textContent = "The clipboard holds no image. Copy an image (or take a screenshot) and paste again.";
      return;
    }
    event.preventDefault();
    void show(file);
  });
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.dataset.over = "";
  });
  zone.addEventListener("dragleave", () => {
    delete zone.dataset.over;
  });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    delete zone.dataset.over;
    const file = imageFrom(event.dataTransfer?.files);
    if (file) void show(file);
  });
  for (const select of [width, bytes]) {
    select.addEventListener("change", () => {
      if (current) void show(current);
    });
  }
}

/* ── Playground: links ───────────────────────────────────────────── */

export function linksDemo() {
  const root = $("[data-links]");
  if (!root) return;
  const page = `${location.origin}${location.pathname}`;
  // A link as it arrives from a newsletter: tracking parameters and all.
  const shared = `${page}?utm_source=newsletter&utm_medium=email&utm_campaign=1.14&fbclid=IwAR0dQx&tab=links#try-it`;
  const title = $("[data-ln-title]", root).textContent.trim();
  const urlLabel = $("[data-ln-url]", root);
  const format = $("[data-ln-format]", root);
  const clean = $("[data-ln-clean]", root);
  const html = $("[data-ln-html]", root);
  const text = $("[data-ln-text]", root);
  const passage = $("[data-ln-passage]", root);
  const selectionButton = $("[data-ln-selection]", root);
  const selectionStatus = $("[data-ln-selection-status]", root);
  const editor = $("[data-ln-editor]", root);
  const status = $("[data-ln-status]", root);

  const payload = (target) =>
    linkPayload({ url: shared, title }, { clean: clean.checked, text: format.value, ...(target ? { target } : {}) });
  const showUrl = () => {
    urlLabel.textContent = linkPayload(shared, { clean: clean.checked }).text;
  };
  showUrl();
  clean.addEventListener("change", showUrl);

  wireCopyButton(
    $("[data-ln-copy]", root),
    () => () => {
      const link = payload();
      const anchor = new DOMParser().parseFromString(link.html, "text/html").body.querySelector("a");
      const shown = document.createElement("a");
      shown.href = anchor.getAttribute("href");
      shown.textContent = anchor.textContent;
      html.replaceChildren(shown);
      text.textContent = link.text;
      return link;
    },
    { labels: { idle: "Copy link", copying: "Copying…", copied: "Copied", error: "Retry" } },
  );

  const chip = $("[data-ln-drag]", root);
  registerDragCopy(chip, () => ({ source: () => payload("drag"), effectAllowed: "copyLink" }));

  // Enabled only while words inside the paragraph are selected.
  const selectedInPassage = () => {
    const selection = window.getSelection();
    return (
      selection !== null &&
      !selection.isCollapsed &&
      selection.toString().trim() !== "" &&
      passage.contains(selection.anchorNode) &&
      passage.contains(selection.focusNode)
    );
  };
  document.addEventListener("selectionchange", () => {
    selectionButton.disabled = !selectedInPassage();
  });
  wireCopyButton(
    selectionButton,
    () => () => {
      const link = selectionLink({ url: `${page}#try-it` });
      if (link === null) throw new Error("Nothing is selected.");
      selectionStatus.textContent = `Linked to “${link.quote}”: ${link.url}`;
      return linkPayload(link);
    },
    { labels: { idle: "Copy link to selection", copying: "Copying…", copied: "Copied", error: "Retry" } },
  );

  // Share: the share sheet on touch-first devices, the copied link elsewhere.
  const shareButton = $("[data-ln-share]", root);
  const shareHint = $("[data-ln-share-hint]", root);
  const shareStatus = $("[data-ln-share-status]", root);
  const showMethod = () => {
    shareButton.textContent = shareMethod() === "native" ? "Share…" : "Share";
    shareHint.textContent =
      shareMethod() === "native"
        ? "On this device, Share opens the share sheet. On a computer it copies the link."
        : "On this device, Share copies the link. On a phone or tablet it opens the share sheet.";
  };
  showMethod();
  matchMedia("(hover: none) and (pointer: coarse)").addEventListener("change", showMethod);
  const REASONS = {
    preferred: "this device copies instead of sharing",
    unsupported: "this browser has no share sheet for it",
    fallback: "the share sheet failed",
  };
  let sharing = false;
  shareButton.addEventListener("click", async () => {
    if (sharing) return;
    sharing = true;
    shareStatus.textContent = "";
    delete shareStatus.dataset.state;
    // Called directly in the click: the share sheet needs the click's user activation.
    const outcome = await shareOrCopy({ url: shared, title, text: "A link from the react-smart-copy playground" }, { clean: clean.checked });
    sharing = false;
    if (outcome.status === "shared") shareStatus.textContent = "Shared.";
    else if (outcome.status === "copied") shareStatus.textContent = `Link copied: ${REASONS[outcome.reason]}.`;
    else if (outcome.status === "cancelled") shareStatus.textContent = "Share sheet closed. Nothing was shared.";
    else shareStatus.textContent = describeShareError(outcome.error, outcome.method);
    if (outcome.status === "error") shareStatus.dataset.state = "error";
    else if (outcome.status !== "cancelled") shareStatus.dataset.state = "read";
    if (shareStatus.textContent) announce(shareStatus.textContent);
  });

  editor.addEventListener("paste", (event) => {
    if (pasteAsLink(event)) {
      status.dataset.state = "read";
      status.textContent = "Made the selected text a link.";
      announce("Made the selected text a link");
    } else {
      delete status.dataset.state;
      status.textContent = "Pasted as it is: select some text, then paste a link over it.";
    }
  });
}

/* ── Playground: colours ─────────────────────────────────────────── */

export function colorsDemo() {
  const root = $("[data-colors]");
  if (!root) return;
  const format = $("[data-cl-format]", root);
  const copied = $("[data-cl-copied]", root);
  const preview = $("[data-cl-preview]", root);

  for (const swatch of $$("[data-color]", root)) {
    const value = swatch.dataset.color;
    const name = swatch.dataset.name;
    const chip = document.createElement("span");
    chip.className = "cl-chip";
    // The chip shows the colour as the screen can: sRGB hex, gamut-mapped.
    chip.style.background = formatColor(value, "hex");
    const label = document.createElement("span");
    label.className = "cl-name";
    label.textContent = name;
    const shown = document.createElement("code");
    shown.className = "cl-value";
    // "Copy" is read out but not shown, so the accessible name still contains the visible text.
    const verb = document.createElement("span");
    verb.className = "sr-only";
    verb.textContent = "Copy ";
    label.prepend(verb);
    swatch.replaceChildren(chip, label, shown);
    const show = () => {
      shown.textContent = formatColor(value, format.value);
    };
    show();
    format.addEventListener("change", show);
    // The swatch keeps its content, so it drives a copy machine directly rather than a label stack.
    const machine = createCopyMachine();
    machine.connect();
    machine.subscribe(() => {
      const state = machine.getSnapshot();
      swatch.dataset.displayState = state.status;
      if (state.status === "copied") announce(`Copied ${name}`);
      if (state.status === "error") {
        copied.textContent = describeCopyError(state.error);
        announce(copied.textContent);
      }
    });
    swatch.addEventListener("click", () => {
      void machine.copy(() => {
        const payload = colorPayload(value, { format: format.value });
        preview.textContent = payload.kind === "html" ? payload.text : payload.value;
        copied.textContent = `Copied ${name} as ${format.selectedOptions[0].textContent}.`;
        return payload;
      });
    });
  }

  const hex = $("[data-cl-hex]", root);
  const hexStatus = $("[data-cl-hex-status]", root);
  hex.addEventListener("paste", (event) => {
    if (pasteAsColor(event, { format: "hex" })) {
      hexStatus.dataset.state = "read";
      hexStatus.textContent = `Pasted as ${hex.value}.`;
      announce(hexStatus.textContent);
    } else {
      delete hexStatus.dataset.state;
      hexStatus.textContent = "That isn't a colour: pasted as it is.";
    }
  });

  const fg = $("[data-cl-fg]", root);
  const bg = $("[data-cl-bg]", root);
  const sample = $("[data-cl-sample]", root);
  const ratioOut = $("[data-cl-ratio]", root);
  const update = () => {
    const text = parseColor(fg.value);
    const background = parseColor(bg.value);
    fg.setAttribute("aria-invalid", String(text === null));
    bg.setAttribute("aria-invalid", String(background === null));
    if (text === null || background === null) {
      ratioOut.dataset.state = "error";
      ratioOut.textContent = "Enter a CSS colour in both fields.";
      return;
    }
    sample.style.color = formatColor(text, "rgb");
    sample.style.background = formatColor(background, "rgb");
    const ratio = contrastRatio(text, background);
    const normal = contrastLevel(ratio);
    const large = contrastLevel(ratio, { large: true });
    ratioOut.dataset.state = normal === "fail" ? "error" : "read";
    ratioOut.textContent = `${ratio.toFixed(2)} : 1. Normal text: ${normal}. Large text: ${large}.`;
  };
  fg.addEventListener("input", update);
  bg.addEventListener("input", update);
  update();
}

/* ── Playground: portable rich text ──────────────────────────────── */

const REMOVAL_LABELS = {
  "unsafe-element": "Not safe to paste",
  hidden: "Hidden",
  ignored: "Marked to leave out",
  "unsafe-link": "Unsafe link",
  "unsafe-image": "Image that can't travel",
  image: "Image",
  "unreadable-color": "Unreadable text colour",
  misplaced: "Misplaced in a table",
};

export function richDemo() {
  const root = $("[data-rich]");
  if (!root) return;
  const card = $("[data-rt-card]", root);
  const colors = $("[data-rt-colors]", root);
  const htmlOut = $("[data-rt-html]", root);
  const textOut = $("[data-rt-text]", root);
  const removedOut = $("[data-rt-removed]", root);

  wireCopyButton(
    $("[data-rt-copy]", root),
    () => () => {
      const result = prepareRich(card, { colors: colors.value });
      htmlOut.textContent = result.html;
      textOut.textContent = result.text;
      removedOut.replaceChildren(
        ...result.removed.map((removal) => {
          const item = document.createElement("li");
          const what = document.createElement("span");
          what.className = "cd-where";
          what.textContent = removal.name;
          const why = document.createElement("span");
          why.textContent = `${REMOVAL_LABELS[removal.reason] ?? removal.reason}${removal.count > 1 ? ` (${removal.count})` : ""}`;
          item.append(what, why);
          return item;
        }),
      );
      return { kind: "html", html: result.html, text: result.text };
    },
    { labels: { idle: "Copy for email", copying: "Copying…", copied: "Copied", error: "Retry" } },
  );

  // Native Ctrl/Cmd+C of a selection in the paragraph: portable too.
  const native = $("[data-rt-native]", root);
  const nativeStatus = $("[data-rt-native-status]", root);
  registerCopyInterceptor(native, () => ({
    transform: richTransform(),
    onIntercept: (outcome) => {
      if (outcome.status !== "written") return;
      nativeStatus.dataset.state = "read";
      nativeStatus.textContent = "Copied as portable HTML: paste it into a mail or a document.";
      announce("Copied as portable HTML");
    },
  }));

  richPasteDemo(root);
}

/** What each kind of editor holds: the `formats` option. */
const EDITOR_FORMATS = {
  full: undefined,
  comment: ["bold", "italic", "link", "list"],
  plain: [],
};

/** What Google Docs puts on the clipboard, with a script someone slipped in. */
const DOCS_SAMPLE =
  '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-5a1b"><h2 dir="ltr"><span style="font-size:16pt;font-family:Arial;font-weight:400;">Launch checklist</span></h2>' +
  '<p dir="ltr"><span style="font-family:Arial;font-weight:400;">Ship </span><span style="font-weight:700;">Thursday</span><span style="font-weight:400;"> after the </span>' +
  '<span style="font-style:italic;">final</span><span> review. Notes in </span><a href="https://www.google.com/url?q=https://example.com/notes&amp;sa=D"><span style="color:#1155cc;text-decoration:underline;">the doc</span></a><span>.</span></p>' +
  '<ul style="margin-top:0;"><li dir="ltr" aria-level="1"><p dir="ltr" role="presentation"><span>Freeze </span><span style="font-family:\'Courier New\',monospace;">main</span></p></li>' +
  '<li dir="ltr" aria-level="1"><p dir="ltr" role="presentation"><span style="text-decoration:line-through;">Draft notes</span></p></li></ul>' +
  '<div dir="ltr"><table style="border:none;border-collapse:collapse;"><tbody><tr><td><p><span style="font-weight:700;">Owner</span></p></td><td><p><span style="font-weight:700;">Task</span></p></td></tr>' +
  '<tr><td><p><span>Ada</span></p></td><td><p><span>Release notes</span></p></td></tr></tbody></table></div>' +
  '<img src="x" onerror="alert(1)"><script>alert(1)</script></b>';

function richPasteDemo(root) {
  const editor = $("[data-rt-editor]", root);
  const kind = $("[data-rt-kind]", root);
  const status = $("[data-rt-paste-status]", root);
  const htmlOut = $("[data-rt-paste-html]", root);

  const onPaste = (pasted) => {
    htmlOut.textContent = pasted.html;
    const removed = pasted.removed.map((removal) => {
      const count = removal.count > 1 ? `${removal.count} ` : "";
      if (removal.reason === "unsafe-link") return `${count}${removal.name} link${removal.count > 1 ? "s" : ""}`;
      if (removal.reason === "unsafe-image") return `${count}image${removal.count > 1 ? "s" : ""} with a ${removal.name} address`;
      return `${count}<${removal.name}>`;
    });
    status.dataset.state = "read";
    status.textContent = removed.length > 0 ? `Pasted clean HTML. Left out: ${removed.join(", ")}.` : "Pasted clean HTML: nothing needed leaving out.";
    announce("Pasted clean HTML");
  };
  const options = () => {
    const formats = EDITOR_FORMATS[kind.value];
    return formats === undefined ? { onPaste } : { formats, onPaste };
  };

  editor.addEventListener("paste", (event) => {
    pasteAsRich(event, options());
  });

  // The same handler, fed the sample as a paste event would carry it.
  $("[data-rt-sample]", root).addEventListener("click", () => {
    editor.focus();
    const data = { "text/html": DOCS_SAMPLE, "text/plain": "Launch checklist" };
    pasteAsRich(
      {
        clipboardData: { getData: (format) => data[format] ?? "" },
        currentTarget: editor,
        target: editor,
        defaultPrevented: false,
        preventDefault() {},
      },
      options(),
    );
  });

  $("[data-rt-clear]", root).addEventListener("click", () => {
    editor.replaceChildren();
    htmlOut.textContent = "Paste to see it.";
    status.dataset.state = "";
    status.textContent = "Nothing pasted yet.";
    editor.focus();
  });
}

/* ── Files: take drops and pastes safely ─────────────────────────── */

const SAMPLE_BYTES = {
  pdf: () => new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n"),
  png: () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
  exe: () => Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff]),
  docm: () => new TextEncoder().encode("PK\u0003\u0004....[Content_Types].xml....word/document.xml....word/vbaProject.bin"),
};

/** A sample set: what people mean to share, and what attackers hope gets through. */
function sampleFiles() {
  const text = (body) => new TextEncoder().encode(body);
  const make = (data, name, type = "") => new File([data], name, { type, lastModified: Date.now() });
  return [
    make(SAMPLE_BYTES.pdf(), "Q3 report.pdf", "application/pdf"),
    make(SAMPLE_BYTES.png(), "chart.png", "image/png"),
    make(text("month,revenue\nJuly,12400\nAugust,13950\n"), "revenue.csv", "text/csv"),
    make(text("month,revenue\nJuly,12400\nAugust,13950\n"), "revenue (1).csv", "text/csv"),
    make(text("<!doctype html><script>steal(document.cookie)</script>"), "invoice.pdf", "application/pdf"),
    make(SAMPLE_BYTES.exe(), "invoice.pdf.exe"),
    make(SAMPLE_BYTES.exe(), "photo\u202Egpj.exe"),
    make(SAMPLE_BYTES.docm(), "budget.docm"),
    make(text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), "logo.svg", "image/svg+xml"),
    make(new Uint8Array(), "notes.txt", "text/plain"),
  ];
}

export function filesDemo() {
  const root = $("[data-files]");
  if (!root) return;
  const zone = $("[data-fl-zone]", root);
  const status = $("[data-fl-status]", root);
  const results = $("[data-fl-results]", root);
  const acceptedList = $("[data-fl-accepted]", root);
  const rejectedList = $("[data-fl-rejected]", root);
  const accept = $("[data-fl-accept]", root);
  const active = $("[data-fl-active]", root);
  const digest = $("[data-fl-digest]", root);
  let run = 0;

  const options = () => ({
    accept: accept.value || undefined,
    block: ["executable", "macros", "type-mismatch", "double-extension", "hidden-characters", "empty", ...(active.checked ? [] : ["active-content"])],
    digest: digest.checked,
    maxFiles: 200,
    maxFileBytes: 50 * 1024 * 1024,
  });

  const item = (title, detail) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "fl-name";
    name.textContent = title;
    const info = document.createElement("span");
    info.className = "fl-detail";
    info.textContent = detail;
    li.append(name, info);
    return li;
  };

  function show({ accepted, rejected, totalBytes, truncated }) {
    acceptedList.replaceChildren(
      ...(accepted.length === 0
        ? [item("None", "")]
        : accepted.map((file) => item(file.path, `${file.type}, ${formatBytes(file.size)}${file.sha256 ? `, SHA-256 ${file.sha256.slice(0, 12)}\u2026` : ""}`))),
    );
    rejectedList.replaceChildren(...(rejected.length === 0 ? [item("None", "")] : rejected.map((file) => item(file.path, file.message))));
    results.hidden = false;
    const summary = `${plural(accepted.length, "file")} added (${formatBytes(totalBytes)}), ${rejected.length} not added${truncated ? ", and the rest left out" : ""}.`;
    // Turning risky files away is the feature working, not an error.
    status.dataset.state = "read";
    status.textContent = summary;
    announce(summary);
  }

  async function take(source) {
    const id = (run += 1);
    // Called before any await: a drop's DataTransfer is emptied when its event ends.
    const pending = acceptFiles(source, options());
    status.dataset.state = "reading";
    status.textContent = "Reading the files\u2026";
    try {
      const result = await pending;
      if (id === run) show(result);
    } catch (error) {
      if (id !== run) return;
      status.dataset.state = "error";
      status.textContent = error?.copyError ? describePasteError(error.copyError) : "The files could not be read.";
    }
  }

  $("[data-fl-sample]", root).addEventListener("click", () => {
    void take(sampleFiles());
  });
  const input = $("[data-fl-input]", root);
  input.addEventListener("change", () => {
    if (input.files && input.files.length > 0) void take(input.files);
    input.value = "";
  });
  zone.addEventListener("paste", (event) => {
    if (!event.clipboardData || event.clipboardData.files.length === 0) return;
    event.preventDefault();
    void take(event);
  });
  let depth = 0;
  const setOver = (on) => zone.toggleAttribute("data-drag-over", on);
  zone.addEventListener("dragenter", (event) => {
    depth += 1;
    if (event.dataTransfer?.types.includes("Files")) setOver(true);
  });
  zone.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  zone.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) setOver(false);
  });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    depth = 0;
    setOver(false);
    void take(event);
  });
}

/* ── Secrets: find, redact, keep out of pastes and copies ───────────── */

/** `length` random characters from `alphabet`, from the browser's random generator. */
function randomText(length, alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") {
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

const base64url = (text) => btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Fake secrets, made here when the page loads: no file holds one, and none grants access to anything. */
function fakeSecrets() {
  return {
    github: ["gh", "p_", randomText(36)].join(""),
    aws: ["AK", "IA", randomText(16, "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")].join(""),
    stripe: ["sk", "_live_", randomText(24)].join(""),
    password: randomText(14),
    apiKey: randomText(20),
    jwt: [base64url('{"alg":"HS256","typ":"JWT"}'), base64url('{"sub":"42","name":"Ada"}'), randomText(43)].join("."),
    // A card brand's published test number: a valid checksum, never a real card.
    card: "4242 4242 4242 4242",
  };
}

export function secretsDemo() {
  const root = $("[data-secrets]");
  if (!root) return;
  const fake = fakeSecrets();
  const input = $("[data-sc-input]", root);
  const status = $("[data-sc-status]", root);
  const results = $("[data-sc-results]", root);
  const findingsList = $("[data-sc-findings]", root);
  const redactedOut = $("[data-sc-redacted]", root);

  const sample = [
    "Hi team, the deploy failed. Here is the config I used:",
    "",
    `AWS_ACCESS_KEY_ID=${fake.aws}`,
    `GITHUB_TOKEN=${fake.github}`,
    `DATABASE_URL=postgres://app:${fake.password}@db.internal:5432/app`,
    `STRIPE_KEY=${fake.stripe}`,
    `MAPS_API_KEY="${fake.apiKey}"`,
    "",
    `The customer paid with ${fake.card}, session ${fake.jwt}`,
  ].join("\n");

  function scan() {
    const text = input.value;
    if (text.trim() === "") {
      results.hidden = true;
      status.textContent = "Nothing scanned yet.";
      return;
    }
    const { findings } = scanSecrets(text);
    findingsList.replaceChildren(
      ...(findings.length === 0
        ? [Object.assign(document.createElement("li"), { textContent: "No secrets." })]
        : findings.map((finding) => {
            const li = document.createElement("li");
            const name = document.createElement("span");
            name.className = "fl-name";
            name.textContent = finding.masked;
            const detail = document.createElement("span");
            detail.className = "fl-detail";
            detail.textContent = `${finding.label}, ${finding.confidence} confidence`;
            li.append(name, detail);
            return li;
          })),
    );
    redactedOut.textContent = redactSecrets(text).text;
    results.hidden = false;
    status.textContent = findings.length === 0 ? "No secrets found." : `${plural(findings.length, "secret")} found.`;
  }

  input.addEventListener("input", scan);
  $("[data-sc-sample]", root).addEventListener("click", () => {
    input.value = sample;
    scan();
  });
  $("[data-sc-clear]", root).addEventListener("click", () => {
    input.value = "";
    scan();
    input.focus();
  });

  // Paste into a chat box: secrets are redacted or the paste is blocked.
  const chat = $("[data-sc-chat]", root);
  const chatStatus = $("[data-sc-chat-status]", root);
  const action = $("[data-sc-action]", root);
  chat.addEventListener("paste", (event) => {
    const outcome = pasteWithoutSecrets(event, {
      action: action.value,
      onSecrets: (found, done) => {
        const labels = [...new Set(found.map((finding) => finding.label))].join(", ");
        const message = done === "redacted" ? `Pasted with a ${labels} removed.` : `Paste blocked: it held a ${labels}.`;
        chatStatus.dataset.state = "read";
        chatStatus.textContent = message;
        announce(message);
      },
    });
    if (outcome === "clean") {
      chatStatus.dataset.state = "";
      chatStatus.textContent = "No secrets: pasted as it was.";
    }
  });
  const tokenButton = $("[data-sc-copy-token]", root);
  wireCopyButton(tokenButton, () => `Can you check this? My token is ${fake.github}`, {
    root: tokenButton,
    labels: { ...COPY_LABELS, idle: "Copy a fake token" },
  });

  // Copy from a log: secrets in what people copy are redacted.
  const log = $("[data-sc-log]", root);
  const logStatus = $("[data-sc-log-status]", root);
  log.textContent = [
    "10:02:11 INFO  deploy started by ada",
    `10:02:12 DEBUG auth header Bearer ${fake.jwt}`,
    `10:02:13 DEBUG using key ${fake.aws}`,
    "10:02:15 INFO  deploy finished in 4.1 s",
  ].join("\n");
  registerCopyInterceptor(log, {
    transform: secretRedactor(),
    onIntercept: (outcome) => {
      if (outcome.status === "written") {
        logStatus.dataset.state = "read";
        logStatus.textContent = "Copied with its secrets redacted: paste it anywhere to see.";
        announce("Copied with secrets redacted");
      } else {
        logStatus.dataset.state = "";
        logStatus.textContent = "No secrets in that selection: copied as it was.";
      }
    },
  });
}

const OTP_SOURCES = {
  "whole-text": "the message is the code",
  "origin-bound": "bound to its site, as WebOTP reads it",
  keyword: "next to a word that names it",
  "only-candidate": "the only number that could be one",
};

export function otpDemo() {
  const root = $("[data-otp]");
  if (!root) return;
  const status = $("[data-otp-status]", root);
  const field = createOtpField({
    length: 6,
    onChange: (snapshot) => {
      status.dataset.state = "";
      status.textContent = snapshot.value === "" ? "Enter the 6-digit code." : `${plural(6 - snapshot.value.length, "digit")} to go.`;
    },
    onComplete: (code) => {
      status.dataset.state = "read";
      status.textContent = `Code ${code} entered.`;
      announce(`Code ${code} entered`);
    },
  });
  field.attach([...root.querySelectorAll("[data-otp-box]")]);
  $("[data-otp-clear]", root).addEventListener("click", field.clear);
  const smsButton = $("[data-otp-copy-sms]", root);
  wireCopyButton(smsButton, () => "Your Example verification code is 582047. It expires in 10 minutes. Don't share it.", {
    root: smsButton,
    labels: { ...COPY_LABELS, idle: "Copy a sample SMS" },
  });

  const message = $("[data-otp-message]", root);
  const readStatus = $("[data-otp-read-status]", root);
  const samples = {
    sms: "Your Example verification code is 582047. It expires in 10 minutes. Don't share it.",
    bound: "Your Example code is 731964.\n\n@example.com #731964",
    mail: "Hi Ada,\n\nSomeone is signing in to your account from Firefox on Windows on 23/10/2026 at 10:42.\nIf this was you, enter this code: 40 96 13\n\nThe Example team, +1 (555) 010-2048",
    none: "Your order 48291 of $1,249.00 ships on 24/10. Track it at example.com/t/48291.",
  };
  function read() {
    const text = message.value;
    if (text.trim() === "") {
      readStatus.dataset.state = "";
      readStatus.textContent = "Nothing read yet.";
      return;
    }
    const match = extractOtp(text, { domain: "example.com" });
    readStatus.dataset.state = match ? "read" : "";
    readStatus.textContent = match
      ? `Code ${match.code}, ${match.confidence} confidence: ${OTP_SOURCES[match.source]}.`
      : "No code: no number here reads as one.";
  }
  message.addEventListener("input", read);
  for (const button of root.querySelectorAll("[data-otp-sample]")) {
    button.addEventListener("click", () => {
      message.value = samples[button.dataset.otpSample];
      read();
    });
  }
}

const NUMBER_KINDS = { number: "", percent: " (a percentage)", permille: " (per mille)" };

export function numberDemo() {
  const root = $("[data-number]");
  if (!root) return;
  const locale = $("[data-nm-locale]", root);
  const input = $("[data-nm-input]", root);
  const status = $("[data-nm-status]", root);
  const result = $("[data-nm-result]", root);
  const out = {
    value: $("[data-nm-value]", root),
    exact: $("[data-nm-exact]", root),
    currency: $("[data-nm-currency]", root),
    written: $("[data-nm-written]", root),
  };

  function read() {
    const text = input.value;
    if (text.trim() === "") {
      result.hidden = true;
      status.dataset.state = "";
      status.textContent = "Nothing read yet.";
      return;
    }
    const parsed = parseNumber(text, { locale: locale.value });
    if (parsed === null) {
      result.hidden = true;
      status.dataset.state = "error";
      status.textContent = "Not a number: it holds something else, or its grouping is wrong.";
      return;
    }
    out.value.textContent = `${String(parsed.value)}${NUMBER_KINDS[parsed.kind]}`;
    out.exact.textContent = parsed.exact;
    out.currency.textContent = parsed.currency === null ? "None" : `${parsed.currency.symbol} (${parsed.currency.code ?? "could be several"})`;
    out.written.textContent = formatNumber(parsed.exact, { locale: locale.value, grouping: true });
    result.hidden = false;
    status.dataset.state = "read";
    status.textContent = parsed.ambiguous
      ? `Read as ${parsed.exact}: the separator could go either way, and ${locale.selectedOptions[0].textContent} settled it.`
      : `Read as ${parsed.exact}.`;
  }
  input.addEventListener("input", read);
  locale.addEventListener("change", read);
  for (const button of root.querySelectorAll("[data-nm-sample]")) {
    button.addEventListener("click", () => {
      input.value = button.dataset.nmSample;
      read();
    });
  }

  const field = $("[data-nm-field]", root);
  const fieldStatus = $("[data-nm-field-status]", root);
  field.addEventListener("paste", (event) => {
    pasteAsNumber(event, {
      locale: locale.value,
      onNumber: (parsed) => {
        fieldStatus.dataset.state = "read";
        fieldStatus.textContent = `Pasted ${parsed.exact}.`;
        announce(`Pasted ${parsed.exact}`);
      },
      onReject: () => {
        fieldStatus.dataset.state = "error";
        fieldStatus.textContent = "That paste is not a number: the field was left as it was.";
      },
    });
  });
  for (const button of root.querySelectorAll("[data-nm-copy]")) {
    wireCopyButton(button, () => button.dataset.nmCopy, {
      root: button,
      labels: { ...COPY_LABELS, idle: button.textContent },
    });
  }
}
