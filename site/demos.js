// Every demo on this page runs on the published library: no hand-rolled
// clipboard logic. Read this file alongside the docs below it.
import { svgToPngBlob } from "./capture.js";
import {
  canAcceptDrag,
  canRetryPasteState,
  createBrowserClipboardAdapter,
  createCopyCoordinator,
  createCopyMachine,
  createPasteMachine,
  describeCopyError,
  describePasteError,
  resolvePasteReadOptions,
} from "./core.js";
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
  ctx.fillStyle = "#2B3FBF";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, canvas.width, canvas.height, 10);
  else ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = '600 24px "JetBrains Mono", ui-monospace, monospace';
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

heroDemo();
copyRowsDemo();
pasteHookDemo();
pasteFieldDemo();
copyGroupDemo();
captureDemo();
