import type { Tracker, TrackerMutationEvent } from "../core/index.js";

const HIGHLIGHT_CLASS = "mutation-tracker-highlight";

export interface TrackerPanelOptions {
  readonly document?: Document;
  readonly highlightColor?: string;
  readonly highlightDuration?: number;
  readonly console?: Pick<Console, "groupCollapsed" | "groupEnd" | "log">;
}

export interface TrackerPanel {
  mount(): void;
  unmount(): void;
}

interface HighlightTimers {
  readonly element: Element;
  fadeTimer: number;
  removeTimer?: number;
}

function validateOptions(options: TrackerPanelOptions): void {
  if (
    options.highlightColor !== undefined &&
    typeof options.highlightColor !== "string"
  ) {
    throw new TypeError("Panel highlightColor must be a string");
  }

  if (
    options.highlightDuration !== undefined &&
    (!Number.isFinite(options.highlightDuration) ||
      options.highlightDuration < 0)
  ) {
    throw new RangeError(
      "Panel highlightDuration must be a non-negative number",
    );
  }
}

function getAction(event: TrackerMutationEvent): string {
  if (event.type !== "childList") return event.type;
  if (event.addedNodes.length > 0 && event.removedNodes.length === 0)
    return "Added";
  if (event.addedNodes.length === 0 && event.removedNodes.length > 0)
    return "Removed";
  return "Modified";
}

export function createPanel(
  tracker: Tracker,
  options: TrackerPanelOptions = {},
): TrackerPanel {
  if (!tracker || typeof tracker.subscribe !== "function") {
    throw new TypeError("Panel tracker must be a Tracker instance");
  }

  validateOptions(options);

  const highlightColor = options.highlightColor ?? "#ff0000";
  const highlightDuration = options.highlightDuration ?? 3_000;
  const highlights = new Map<Element, HighlightTimers>();
  let unsubscribe: (() => void) | null = null;
  let styleElement: HTMLStyleElement | null = null;

  function getDocument(): Document {
    const document = options.document ?? globalThis.document;
    if (!document) {
      throw new Error("No document is available for the tracker panel");
    }
    return document;
  }

  function createStyles(document: Document): HTMLStyleElement {
    const style = document.createElement("style");
    style.setAttribute("data-mutation-tracker", "true");
    style.textContent = `
      .${HIGHLIGHT_CLASS} {
        outline: 3px solid ${highlightColor} !important;
        outline-offset: 2px !important;
        transition: outline 0.3s ease !important;
      }
      .${HIGHLIGHT_CLASS}-fade-out {
        outline: transparent 3px solid !important;
        outline-offset: 2px !important;
        transition: outline 0.3s ease !important;
      }
    `;
    document.head.appendChild(style);
    return style;
  }

  function highlight(event: TrackerMutationEvent): void {
    const document = getDocument();
    if (event.target.selector === "unknown") return;

    let element: Element | null;
    try {
      element = document.querySelector(event.target.selector);
    } catch {
      return;
    }

    if (!element || highlights.has(element)) return;

    const view = document.defaultView;
    if (!view) return;

    element.classList.add(HIGHLIGHT_CLASS);
    const timers: HighlightTimers = {
      element,
      fadeTimer: view.setTimeout(() => {
        element.classList.remove(HIGHLIGHT_CLASS);
        element.classList.add(`${HIGHLIGHT_CLASS}-fade-out`);
        timers.removeTimer = view.setTimeout(() => {
          element.classList.remove(`${HIGHLIGHT_CLASS}-fade-out`);
          highlights.delete(element);
        }, 300);
      }, highlightDuration),
    };
    highlights.set(element, timers);
  }

  function log(event: TrackerMutationEvent): void {
    const output = options.console ?? globalThis.console;
    const time =
      event.timestamp.split("T")[1]?.split(".")[0] ?? event.timestamp;

    switch (event.type) {
      case "attributes":
        output.groupCollapsed(
          `🔧 ${event.attributeName} → ${event.target.description}`,
        );
        output.log("Target:", event.target);
        output.log("Attribute:", event.attributeName);
        output.log("Old:", event.oldValue);
        output.log("New:", event.newValue);
        break;

      case "childList":
        output.groupCollapsed(
          `${getAction(event)} → ${event.target.description}`,
        );
        output.log("Target:", event.target);
        if (event.addedNodes.length > 0) output.log("Added:", event.addedNodes);
        if (event.removedNodes.length > 0)
          output.log("Removed:", event.removedNodes);
        break;

      case "characterData":
        output.groupCollapsed(
          `Text → ${event.target.description} "${event.newValue ?? ""}"`,
        );
        output.log("Target:", event.target);
        output.log("Old:", event.oldValue);
        output.log("New:", event.newValue);
        break;
    }

    output.log("Time:", time);
    output.groupEnd();
  }

  function mount(): void {
    if (unsubscribe) return;

    styleElement = createStyles(getDocument());
    unsubscribe = tracker.subscribe((event) => {
      highlight(event);
      log(event);
    });
  }

  function unmount(): void {
    unsubscribe?.();
    unsubscribe = null;
    styleElement?.remove();
    styleElement = null;

    const view = options.document?.defaultView ?? globalThis.window;
    for (const timers of highlights.values()) {
      view?.clearTimeout(timers.fadeTimer);
      if (timers.removeTimer !== undefined)
        view?.clearTimeout(timers.removeTimer);
      timers.element.classList.remove(
        HIGHLIGHT_CLASS,
        `${HIGHLIGHT_CLASS}-fade-out`,
      );
    }
    highlights.clear();
  }

  return Object.freeze({ mount, unmount });
}
