// Shared helpers for the live demos. Everything clipboard-related runs on the real library: the
// docs resolve `react-smart-copy/*` to the built package in ../dist (astro.config.mjs).
import { createCopyMachine, describeCopyError } from "react-smart-copy/core";

export const PENDING_DELAY_MS = 150;
export const MIN_PENDING_MS = 400;
export const COPY_LABELS = { idle: "Copy", copying: "Copying…", copied: "Copied", error: "Retry" };
export const PASTE_LABELS = { idle: "Paste", reading: "Pasting…", read: "Pasted", error: "Retry" };

/** One polite live region for the whole page, made by the first demo that needs it. */
let announcer;
function liveRegion() {
  if (!announcer) {
    announcer = document.createElement("span");
    announcer.className = "sr-only";
    announcer.setAttribute("role", "status");
    announcer.setAttribute("aria-live", "polite");
    announcer.setAttribute("aria-atomic", "true");
    document.body.append(announcer);
  }
  return announcer;
}
export function announce(message) {
  const announcer = liveRegion();
  announcer.textContent = "";
  // A fresh write in the next frame makes repeated messages announce again.
  requestAnimationFrame(() => {
    announcer.textContent = message;
  });
}

/**
 * Flicker-free display status, mirroring useDisplayStatus / usePasteDisplayStatus:
 * the pending state only appears after 150 ms, then stays at least 400 ms.
 */
export function createDisplayStatus(pending, onChange) {
  let settled = "idle";
  let shownAt = null;
  let status = "idle";
  let current;
  let delayTimer;
  let holdTimer;
  const emit = (next) => {
    if (next !== current) {
      current = next;
      onChange(next);
    }
  };
  const resolve = () => (shownAt !== null ? pending : status === pending ? settled : status);
  emit("idle");
  return (next) => {
    status = next;
    clearTimeout(delayTimer);
    if (next === pending) {
      clearTimeout(holdTimer);
      delayTimer = setTimeout(() => {
        shownAt = performance.now();
        emit(resolve());
      }, PENDING_DELAY_MS);
    } else {
      settled = next;
      if (shownAt !== null) {
        const remaining = Math.max(0, MIN_PENDING_MS - (performance.now() - shownAt));
        holdTimer = setTimeout(() => {
          shownAt = null;
          emit(resolve());
        }, remaining);
      }
    }
    emit(resolve());
  };
}

/** Stable-width button label: every state stacked in one grid cell. Returns a setter. */
export function labelStack(button, labels) {
  const stack = document.createElement("span");
  stack.className = "stack";
  for (const [state, text] of Object.entries(labels)) {
    const span = document.createElement("span");
    span.dataset.label = state;
    span.textContent = text;
    stack.append(span);
  }
  button.replaceChildren(stack);
  return (state) => {
    for (const span of stack.children) {
      const active = span.dataset.label === state;
      span.toggleAttribute("data-active", active);
      span.setAttribute("aria-hidden", String(!active));
    }
  };
}

/**
 * Wires a copy button to a copy machine with the flicker-free label.
 * `getSource` runs inside the click, so the user gesture is preserved.
 */
export function wireCopyButton(button, getSource, { root = button, machine = createCopyMachine(), onState, labels = COPY_LABELS } = {}) {
  const setLabel = labelStack(button, labels);
  const show = createDisplayStatus("copying", (state) => {
    root.dataset.displayState = state;
    button.dataset.displayState = state;
    setLabel(state);
  });
  machine.subscribe(() => {
    const state = machine.getSnapshot();
    root.dataset.state = state.status;
    show(state.status);
    onState?.(state);
    if (state.status === "copied") announce("Copied to clipboard");
    if (state.status === "error") announce(describeCopyError(state.error));
  });
  machine.connect();
  button.addEventListener("click", () => {
    void machine.copy(getSource());
  });
  return machine;
}

/* Code samples: syntax colouring and copy buttons */
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

/** Colours each demo's code sample and gives it a copy button. Safe to call more than once. */
export function highlightAll() {
for (const block of document.querySelectorAll(".rsc-demo .code:not([data-highlighted])")) {
  block.setAttribute("data-highlighted", "");
  const code = block.querySelector("pre code");
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
}
