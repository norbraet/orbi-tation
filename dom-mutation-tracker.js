(function () {
  "use strict";

  // ================================= Configuration =================================
  const CONFIG = {
    highlightColor: "#ff0000",
    highlightDuration: 3000,
    maxLogEntries: 100,
    debounceTime: 50,
    highlightClassName: "mutation-tracker-highlight",
  };

  // ================================= Variables =================================
  let mutationLog = [];
  let recentMutations = new Map();
  let isTracking = false;
  let observer = null;
  let highlightingElements = new Set();
  let styleElement = null;

  // ================================= Styling Function =================================
  function createHighlightStyles() {
    if (styleElement) return;

    styleElement = document.createElement("style");
    styleElement.setAttribute("data-mutation-tracker", "true");
    styleElement.textContent = `
            .${CONFIG.highlightClassName} {
                outline: 3px solid ${CONFIG.highlightColor} !important;
                outline-offset: 2px !important;
                transition: outline 0.3s ease !important;
            }
            .${CONFIG.highlightClassName}-fade-out {
                outline: transparent 3px solid !important;
                outline-offset: 2px !important;
                transition: outline 0.3s ease !important;
            }
        `;
    document.head.appendChild(styleElement);
  }

  function removeHighlightStyles() {
    if (styleElement) {
      styleElement.remove();
      styleElement = null;
    }
  }

  // ================================= Selectors =================================
  function getElementClasses(element) {
    if (!element || typeof element.getAttribute !== "function") return [];

    const className = element.getAttribute("class");
    if (typeof className !== "string") return [];

    return className.trim().split(/\s+/).filter(Boolean);
  }

  function escapeCssIdentifier(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    const string = String(value);

    return Array.from(string, (character, index) => {
      const codePoint = character.codePointAt(0);

      if (codePoint === 0) return "\uFFFD";

      if (
        (codePoint >= 1 && codePoint <= 31) ||
        codePoint === 127 ||
        (index === 0 && codePoint >= 48 && codePoint <= 57) ||
        (index === 1 && codePoint >= 48 && codePoint <= 57 && string[0] === "-")
      ) {
        return `\\${codePoint.toString(16)} `;
      }

      if (index === 0 && character === "-" && string.length === 1) {
        return "\\-";
      }

      if (
        codePoint >= 128 ||
        character === "-" ||
        character === "_" ||
        (codePoint >= 48 && codePoint <= 57) ||
        (codePoint >= 65 && codePoint <= 90) ||
        (codePoint >= 97 && codePoint <= 122)
      ) {
        return character;
      }

      return `\\${character}`;
    }).join("");
  }

  function getElementSelector(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "unknown";

    const tag = element.tagName.toLowerCase();
    const idValue = element.getAttribute("id");
    const id = idValue ? `#${escapeCssIdentifier(idValue)}` : "";
    const classes = getElementClasses(element)
      .map((className) => `.${escapeCssIdentifier(className)}`)
      .join("");
    const nthChild =
      Array.from(element.parentNode?.children || []).indexOf(element) + 1;

    return `${tag}${id}${classes}:nth-child(${nthChild})`;
  }

  function getShortElementDescription(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "unknown";

    const tag = element.tagName.toLowerCase();
    const idValue = element.getAttribute("id");
    const id = idValue ? `#${idValue}` : "";
    const firstClassName = getElementClasses(element)[0];
    const firstClass = firstClassName ? `.${firstClassName}` : "";

    return `${tag}${id}${firstClass}`;
  }

  function isHighlightMutation(mutation) {
    if (mutation.type !== "attributes") return false;

    // Check if it's our highlight class being added/removed
    if (mutation.attributeName === "class") {
      const target = mutation.target;
      const newClasses = getElementClasses(target);
      const oldClasses = mutation.oldValue || "";

      const isHighlightClassChange =
        newClasses.includes(CONFIG.highlightClassName) ||
        oldClasses.includes(CONFIG.highlightClassName);

      return isHighlightClassChange;
    }

    return false;
  }

  function highlightElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    if (highlightingElements.has(element)) return;

    highlightingElements.add(element);
    element.classList.add(CONFIG.highlightClassName);

    setTimeout(() => {
      // Fade out effect
      element.classList.remove(CONFIG.highlightClassName);
      element.classList.add(`${CONFIG.highlightClassName}-fade-out`);

      setTimeout(() => {
        // Remove all highlight classes
        element.classList.remove(`${CONFIG.highlightClassName}-fade-out`);
        highlightingElements.delete(element);
      }, 300);
    }, CONFIG.highlightDuration);
  }

  // ================================= Mutation Handling =================================
  function createMutationKey(mutation, target) {
    const type = mutation.type;
    const selector = getElementSelector(target);
    const attributeName = mutation.attributeName || "";

    return `${type}-${selector}-${attributeName}`;
  }

  // Check if mutation is duplicate
  function isDuplicateMutation(mutationKey) {
    const now = Date.now();
    const lastTime = recentMutations.get(mutationKey);

    if (lastTime && now - lastTime < CONFIG.debounceTime) {
      return true;
    }

    recentMutations.set(mutationKey, now);

    // Clean up old entries
    for (const [key, time] of recentMutations.entries()) {
      if (now - time > CONFIG.debounceTime * 2) {
        recentMutations.delete(key);
      }
    }

    return false;
  }

  function processMutation(mutation) {
    // Skip mutations caused by our highlighting
    if (isHighlightMutation(mutation)) {
      return;
    }

    const target = mutation.target;
    const mutationKey = createMutationKey(mutation, target);

    // Skip duplicate mutations
    if (isDuplicateMutation(mutationKey)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const selector = getElementSelector(target);

    let logData = {
      timestamp,
      type: mutation.type,
      target,
      selector,
      mutation,
    };

    // Highlight the mutated element
    if (target.nodeType === Node.ELEMENT_NODE) {
      highlightElement(target);
    } else if (target.parentElement) {
      highlightElement(target.parentElement);
    }

    // Handle different mutation types
    switch (mutation.type) {
      case "attributes":
        logData.attributeName = mutation.attributeName;
        logData.oldValue = mutation.oldValue;
        logData.newValue = target.getAttribute(mutation.attributeName);
        logAttributesMutation(logData);
        break;

      case "childList":
        logData.addedNodes = Array.from(mutation.addedNodes);
        logData.removedNodes = Array.from(mutation.removedNodes);
        logChildListMutation(logData);
        break;

      case "characterData":
        logData.oldValue = mutation.oldValue;
        logData.newValue = target.textContent;
        logCharacterDataMutation(logData);
        break;
    }

    // Store in log with size limit
    mutationLog.push(logData);
    if (mutationLog.length > CONFIG.maxLogEntries) {
      mutationLog.shift();
    }
  }

  function processMutations(mutations) {
    mutations.forEach((mutation) => {
      try {
        processMutation(mutation);
      } catch (error) {
        console.error("Failed to process DOM mutation:", mutation, error);
      }
    });
  }

  // ================================= Logging Functions =================================
  function logAttributesMutation(data) {
    const shortElement = getShortElementDescription(data.target);
    console.groupCollapsed(`🔧 ${data.attributeName} → ${shortElement}`);
    console.log("Element:", data.target);
    console.log("Attribute:", data.attributeName);
    console.log("Old:", data.oldValue);
    console.log("New:", data.newValue);
    console.log("Time:", data.timestamp.split("T")[1].split(".")[0]);
    console.groupEnd();
  }

  function logChildListMutation(data) {
    const hasAdded = data.addedNodes.length > 0;
    const hasRemoved = data.removedNodes.length > 0;
    const shortElement = getShortElementDescription(data.target);

    let action = "Modified";

    if (hasAdded && !hasRemoved) action = "Added";
    else if (!hasAdded && hasRemoved) action = "Removed";

    console.groupCollapsed(`${action} → ${shortElement}`);
    console.log("Parent:", data.target);

    if (hasAdded) {
      console.log("Added:", data.addedNodes);
    }

    if (hasRemoved) {
      console.log("Removed:", data.removedNodes);
    }

    console.log("Time:", data.timestamp.split("T")[1].split(".")[0]);
    console.groupEnd();
  }

  function logCharacterDataMutation(data) {
    const shortParent = getShortElementDescription(data.target.parentElement);
    const shortText =
      data.newValue?.substring(0, 20) +
      (data.newValue?.length > 20 ? "..." : "");

    console.groupCollapsed(`Text → ${shortParent} "${shortText}"`);
    console.log("Text Node:", data.target);
    console.log("Parent:", data.target.parentElement);
    console.log("Old:", `"${data.oldValue}"`);
    console.log("New:", `"${data.newValue}"`);
    console.log("Time:", data.timestamp.split("T")[1].split(".")[0]);
    console.groupEnd();
  }

  // ================================= Define global Functions =================================
  function startTracking() {
    if (isTracking) {
      console.warn("DOM Mutation Tracker is already running");
      return;
    }

    // Create highlight styles
    createHighlightStyles();

    observer = new MutationObserver(processMutations);

    observer.observe(document.body, {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
    });

    isTracking = true;

    console.group("DOM Mutation Tracker Started");
    console.log("Watching for changes...");
    console.log("Elements will flash red when mutated");
    console.log("stopMutationTracker() to stop");
    console.log("getMutationLog() to view all");
    console.log("clearMutationLog() to clear");
    console.groupEnd();
  }

  function stopTracking() {
    if (!isTracking) {
      console.warn("DOM Mutation Tracker is not running");
      return;
    }

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    // Clean up
    isTracking = false;
    recentMutations.clear();
    highlightingElements.clear();
    removeHighlightStyles();

    console.log(`Stopped tracking (${mutationLog.length} mutations recorded)`);
  }

  function getMutationLog() {
    console.group(`Mutation Log (${mutationLog.length} entries)`);
    mutationLog.forEach((entry, index) => {
      console.log(`${index + 1}.`, entry);
    });
    console.groupEnd();
    return mutationLog;
  }

  function clearMutationLog() {
    const count = mutationLog.length;
    mutationLog = [];
    console.log(`Cleared ${count} entries`);
  }

  // ================================= Expose global functions =================================
  window.startMutationTracker = startTracking;
  window.stopMutationTracker = stopTracking;
  window.getMutationLog = getMutationLog;
  window.clearMutationLog = clearMutationLog;

  // Auto-start tracking
  startTracking();
})();
