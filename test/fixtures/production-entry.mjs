export const applicationName = "host-application";

if (import.meta.env.DEV) {
  void Promise.all([import("orbi-tation"), import("orbi-tation/panel")]).then(
    ([{ createTracker }, { createPanel }]) => {
      const tracker = createTracker();
      const panel = createPanel(tracker);

      panel.mount();
      tracker.start();
    },
  );
}
