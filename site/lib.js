// Shared helpers for the docs site. Everything clipboard-related runs on the
// real library (./core.js and ./capture.js are copied from dist at build time).
import { createCopyMachine, describeCopyError } from "./core.js";

export const PENDING_DELAY_MS = 150;
export const MIN_PENDING_MS = 400;
export const COPY_LABELS = { idle: "Copy", copying: "Copying…", copied: "Copied", error: "Retry" };
export const PASTE_LABELS = { idle: "Paste", reading: "Pasting…", read: "Pasted", error: "Retry" };

/** One polite live region for the whole page. */
const announcer = document.querySelector("[data-announcer]");
export function announce(message) {
  if (!announcer) return;
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
export function wireCopyButton(button, getSource, { root = button, machine = createCopyMachine(), onState } = {}) {
  const setLabel = labelStack(button, COPY_LABELS);
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
