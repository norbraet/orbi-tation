import {
  createTracker,
  type Tracker,
  type TrackerEventListener,
} from "./core/index.js";
import { createPanel } from "./panel/index.js";

interface DOMMutationTrackerGlobal {
  readonly tracker: Tracker;
  start(): void;
  stop(): void;
  clear(): void;
  getEvents(): ReturnType<Tracker["getEvents"]>;
  subscribe(listener: TrackerEventListener): () => void;
}

declare global {
  interface Window {
    DOMMutationTracker?: DOMMutationTrackerGlobal;
    startMutationTracker?: () => void;
    stopMutationTracker?: () => void;
    clearMutationLog?: () => void;
    getMutationLog?: () => ReturnType<Tracker["getEvents"]>;
  }
}

window.DOMMutationTracker?.stop();

const tracker = createTracker();
const panel = createPanel(tracker);

function start(): void {
  panel.mount();
  tracker.start();
}

function stop(): void {
  tracker.stop();
  panel.unmount();
}

function clear(): void {
  tracker.clear();
}

function getEvents(): ReturnType<Tracker["getEvents"]> {
  return tracker.getEvents();
}

function subscribe(listener: TrackerEventListener): () => void {
  return tracker.subscribe(listener);
}

function getMutationLog(): ReturnType<Tracker["getEvents"]> {
  const events = getEvents();
  console.group(`Mutation Log (${events.length} entries)`);
  events.forEach((event, index) => console.log(`${index + 1}.`, event));
  console.groupEnd();
  return events;
}

const globalApi: DOMMutationTrackerGlobal = Object.freeze({
  tracker,
  start,
  stop,
  clear,
  getEvents,
  subscribe,
});

window.DOMMutationTracker = globalApi;
window.startMutationTracker = start;
window.stopMutationTracker = stop;
window.clearMutationLog = clear;
window.getMutationLog = getMutationLog;

start();
