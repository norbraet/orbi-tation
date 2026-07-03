import { createNodeSummary, createTrackerTarget } from "./selectors.js";
import {
  TrackerError,
  type Tracker,
  type TrackerAttributeEvent,
  type TrackerCharacterDataEvent,
  type TrackerChildListEvent,
  type TrackerErrorCode,
  type TrackerEventListener,
  type TrackerMutationEvent,
  type TrackerOptions,
} from "./types.js";

const DEFAULT_MAX_EVENTS = 100;
const DEFAULT_DEDUPE_WINDOW_MS = 50;
const TRACKER_HIGHLIGHT_CLASS = "mutation-tracker-highlight";

interface ResolvedTrackerOptions {
  readonly root?: Node;
  readonly maxEvents: number;
  readonly dedupeWindowMs: number;
  readonly onError: (error: TrackerError) => void;
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Node).nodeType === "number"
  );
}

function defaultErrorReporter(error: TrackerError): void {
  globalThis.console?.error("DOM Mutation Tracker:", error);
}

function validateOptions(
  options: TrackerOptions | undefined,
): ResolvedTrackerOptions {
  if (
    options !== undefined &&
    (typeof options !== "object" || options === null)
  ) {
    throw new TypeError("Tracker options must be an object");
  }

  const candidate = options ?? {};

  if (candidate.root !== undefined && !isNode(candidate.root)) {
    throw new TypeError("Tracker root must be a DOM Node");
  }

  const maxEvents = candidate.maxEvents ?? DEFAULT_MAX_EVENTS;
  if (!Number.isInteger(maxEvents) || maxEvents <= 0) {
    throw new RangeError("Tracker maxEvents must be a positive integer");
  }

  const dedupeWindowMs = candidate.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  if (!Number.isFinite(dedupeWindowMs) || dedupeWindowMs < 0) {
    throw new RangeError(
      "Tracker dedupeWindowMs must be a non-negative number",
    );
  }

  if (
    candidate.onError !== undefined &&
    typeof candidate.onError !== "function"
  ) {
    throw new TypeError("Tracker onError must be a function");
  }

  return {
    root: candidate.root,
    maxEvents,
    dedupeWindowMs,
    onError: candidate.onError ?? defaultErrorReporter,
  };
}

function getMutationObserver(root: Node): typeof MutationObserver | undefined {
  const document =
    root.nodeType === 9 ? (root as Document) : root.ownerDocument;
  return document?.defaultView?.MutationObserver ?? globalThis.MutationObserver;
}

function hasTrackerClass(value: string | null): boolean {
  return (value ?? "")
    .split(/\s+/)
    .some(
      (className) =>
        className === TRACKER_HIGHLIGHT_CLASS ||
        className === `${TRACKER_HIGHLIGHT_CLASS}-fade-out`,
    );
}

function isTrackerOwnedMutation(record: MutationRecord): boolean {
  if (record.type !== "attributes" || record.attributeName !== "class")
    return false;
  if (record.target.nodeType !== 1) return false;

  const currentValue = (record.target as Element).getAttribute("class");
  return hasTrackerClass(currentValue) || hasTrackerClass(record.oldValue);
}

function freezeEvent<T extends TrackerMutationEvent>(event: T): T {
  return Object.freeze(event);
}

export function createTracker(options?: TrackerOptions): Tracker {
  const resolvedOptions = validateOptions(options);
  let observer: MutationObserver | null = null;
  let events: TrackerMutationEvent[] = [];
  let sequence = 0;
  let nodeSequence = 0;
  let nodeIds = new WeakMap<Node, number>();
  const listeners = new Set<TrackerEventListener>();
  const recentMutations = new Map<string, number>();

  function reportError(
    code: TrackerErrorCode,
    message: string,
    cause?: unknown,
  ): void {
    const error = new TrackerError(code, message, cause);

    try {
      resolvedOptions.onError(error);
    } catch (reportingError) {
      queueMicrotask(() => {
        throw reportingError;
      });
    }
  }

  function getNodeId(node: Node): number {
    const existing = nodeIds.get(node);
    if (existing !== undefined) return existing;

    nodeSequence += 1;
    nodeIds.set(node, nodeSequence);
    return nodeSequence;
  }

  function isDuplicate(record: MutationRecord): boolean {
    if (resolvedOptions.dedupeWindowMs === 0) return false;

    const key = `${record.type}-${getNodeId(record.target)}-${record.attributeName ?? ""}`;
    const now = Date.now();
    const previous = recentMutations.get(key);

    if (
      previous !== undefined &&
      now - previous < resolvedOptions.dedupeWindowMs
    ) {
      return true;
    }

    recentMutations.set(key, now);

    for (const [storedKey, timestamp] of recentMutations) {
      if (now - timestamp > resolvedOptions.dedupeWindowMs * 2) {
        recentMutations.delete(storedKey);
      }
    }

    return false;
  }

  function normalizeRecord(record: MutationRecord): TrackerMutationEvent {
    const base = {
      sequence: (sequence += 1),
      timestamp: new Date().toISOString(),
      target: createTrackerTarget(record.target),
    };

    switch (record.type) {
      case "attributes": {
        const target = record.target as Element;
        const event: TrackerAttributeEvent = {
          ...base,
          type: "attributes",
          attributeName: record.attributeName ?? "",
          oldValue: record.oldValue,
          newValue: record.attributeName
            ? target.getAttribute(record.attributeName)
            : null,
        };
        return freezeEvent(event);
      }

      case "childList": {
        const addedNodes = Object.freeze(
          Array.from(record.addedNodes, createNodeSummary),
        );
        const removedNodes = Object.freeze(
          Array.from(record.removedNodes, createNodeSummary),
        );
        const event: TrackerChildListEvent = {
          ...base,
          type: "childList",
          addedNodes,
          removedNodes,
        };
        return freezeEvent(event);
      }

      case "characterData": {
        const event: TrackerCharacterDataEvent = {
          ...base,
          type: "characterData",
          oldValue: record.oldValue,
          newValue: record.target.textContent,
        };
        return freezeEvent(event);
      }
    }
  }

  function publish(event: TrackerMutationEvent): void {
    events.push(event);
    if (events.length > resolvedOptions.maxEvents) {
      events.shift();
    }

    for (const listener of Array.from(listeners)) {
      try {
        listener(event);
      } catch (error) {
        reportError(
          "LISTENER_FAILED",
          "A tracker event listener failed",
          error,
        );
      }
    }
  }

  function processRecords(records: MutationRecord[]): void {
    for (const record of records) {
      if (isTrackerOwnedMutation(record) || isDuplicate(record)) continue;

      try {
        publish(normalizeRecord(record));
      } catch (error) {
        reportError(
          "NORMALIZATION_FAILED",
          "Failed to normalize a mutation record",
          error,
        );
      }
    }
  }

  function start(): void {
    if (observer) return;

    const root = resolvedOptions.root ?? globalThis.document?.body;
    if (!root) {
      throw new TrackerError(
        "MISSING_ROOT",
        "No observation root is available",
      );
    }

    const Observer = getMutationObserver(root);
    if (!Observer) {
      throw new TrackerError(
        "UNSUPPORTED_ENVIRONMENT",
        "MutationObserver is not available in this environment",
      );
    }

    observer = new Observer(processRecords);
    observer.observe(root, {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
    });
  }

  function stop(): void {
    observer?.disconnect();
    observer = null;
    recentMutations.clear();
  }

  function clear(): void {
    events = [];
    recentMutations.clear();
    nodeIds = new WeakMap<Node, number>();
  }

  function getEvents(): readonly TrackerMutationEvent[] {
    return events.slice();
  }

  function subscribe(listener: TrackerEventListener): () => void {
    if (typeof listener !== "function") {
      throw new TypeError("Tracker listener must be a function");
    }

    listeners.add(listener);
    let subscribed = true;

    return () => {
      if (!subscribed) return;
      subscribed = false;
      listeners.delete(listener);
    };
  }

  return Object.freeze({ start, stop, clear, getEvents, subscribe });
}
