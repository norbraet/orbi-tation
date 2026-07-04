export type TrackerErrorCode =
  | "MISSING_ROOT"
  | "UNSUPPORTED_ENVIRONMENT"
  | "NORMALIZATION_FAILED"
  | "LISTENER_FAILED";

export class TrackerError extends Error {
  readonly code: TrackerErrorCode;

  constructor(code: TrackerErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "TrackerError";
    this.code = code;
  }
}

export interface TrackerTarget {
  readonly nodeType: number;
  readonly selector: string;
  readonly description: string;
}

export interface TrackerNodeSummary {
  readonly nodeType: number;
  readonly name: string;
  readonly description: string;
}

export interface TrackerEventBase {
  readonly sequence: number;
  readonly timestamp: string;
  readonly target: TrackerTarget;
}

export interface TrackerAttributeEvent extends TrackerEventBase {
  readonly type: "attributes";
  readonly attributeName: string;
  readonly oldValue: string | null;
  readonly newValue: string | null;
}

export interface TrackerChildListEvent extends TrackerEventBase {
  readonly type: "childList";
  readonly addedNodes: readonly TrackerNodeSummary[];
  readonly removedNodes: readonly TrackerNodeSummary[];
}

export interface TrackerCharacterDataEvent extends TrackerEventBase {
  readonly type: "characterData";
  readonly oldValue: string | null;
  readonly newValue: string | null;
}

export type TrackerMutationEvent =
  TrackerAttributeEvent | TrackerChildListEvent | TrackerCharacterDataEvent;

export type TrackerEventListener = (event: TrackerMutationEvent) => void;

export interface TrackerOptions {
  readonly root?: Node;
  readonly maxEvents?: number;
  readonly dedupeWindowMs?: number;
  readonly onError?: (error: TrackerError) => void;
}

export interface Tracker {
  start(): void;
  stop(): void;
  clear(): void;
  getEvents(): readonly TrackerMutationEvent[];
  subscribe(listener: TrackerEventListener): () => void;
}
