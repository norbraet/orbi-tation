import type { TrackerNodeSummary, TrackerTarget } from "./types.js";

function getElementClasses(element: Element): string[] {
  const className = element.getAttribute("class");
  if (typeof className !== "string") return [];

  return className.trim().split(/\s+/).filter(Boolean);
}

function fallbackEscapeCssIdentifier(value: string): string {
  return Array.from(value, (character, index) => {
    const codePoint = character.codePointAt(0) ?? 0;

    if (codePoint === 0) return "\uFFFD";

    if (
      (codePoint >= 1 && codePoint <= 31) ||
      codePoint === 127 ||
      (index === 0 && codePoint >= 48 && codePoint <= 57) ||
      (index === 1 && codePoint >= 48 && codePoint <= 57 && value[0] === "-")
    ) {
      return `\\${codePoint.toString(16)} `;
    }

    if (index === 0 && character === "-" && value.length === 1) {
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

function escapeCssIdentifier(element: Element, value: string): string {
  const escape = element.ownerDocument.defaultView?.CSS?.escape;
  return typeof escape === "function"
    ? escape(value)
    : fallbackEscapeCssIdentifier(value);
}

export function getElementSelector(node: Node | null): string {
  const element =
    node?.nodeType === 1
      ? (node as Element)
      : node?.parentElement && node.parentElement.nodeType === 1
        ? node.parentElement
        : null;

  if (!element) return "unknown";

  const tag = element.tagName.toLowerCase();
  const idValue = element.getAttribute("id");
  const id = idValue ? `#${escapeCssIdentifier(element, idValue)}` : "";
  const classes = getElementClasses(element)
    .map((className) => `.${escapeCssIdentifier(element, className)}`)
    .join("");
  const siblings = element.parentElement?.children;
  const index = siblings ? Array.from(siblings).indexOf(element) : -1;
  const position = index >= 0 ? `:nth-child(${index + 1})` : "";

  return `${tag}${id}${classes}${position}`;
}

export function getShortElementDescription(node: Node | null): string {
  const element =
    node?.nodeType === 1
      ? (node as Element)
      : node?.parentElement && node.parentElement.nodeType === 1
        ? node.parentElement
        : null;

  if (!element) return "unknown";

  const tag = element.tagName.toLowerCase();
  const idValue = element.getAttribute("id");
  const id = idValue ? `#${idValue}` : "";
  const firstClassName = getElementClasses(element)[0];
  const firstClass = firstClassName ? `.${firstClassName}` : "";

  return `${tag}${id}${firstClass}`;
}

export function createTrackerTarget(node: Node): TrackerTarget {
  return Object.freeze({
    nodeType: node.nodeType,
    selector: getElementSelector(node),
    description: getShortElementDescription(node),
  });
}

export function createNodeSummary(node: Node): TrackerNodeSummary {
  return Object.freeze({
    nodeType: node.nodeType,
    name: node.nodeName.toLowerCase(),
    description: getShortElementDescription(node),
  });
}
