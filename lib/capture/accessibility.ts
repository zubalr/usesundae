import type { AccessibilityNodeSummary, AccessibilitySummary } from "./types";

const MAX_VISITED_NODES = 300;
const MAX_EXPOSED_NODES = 80;
const MAX_DEPTH = 24;
const interactiveRoles = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);
const semanticRoles = new Set([
  ...interactiveRoles,
  "alert",
  "banner",
  "dialog",
  "form",
  "heading",
  "main",
  "navigation",
  "region",
  "status",
]);

type TreeNode = Record<string, unknown>;

function text(value: unknown, maximum = 160) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
}

function positiveLevel(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 10
    ? value
    : undefined;
}

function statesFor(node: TreeNode) {
  const states: string[] = [];
  for (const state of [
    "disabled",
    "expanded",
    "focused",
    "modal",
    "multiline",
    "readonly",
    "required",
    "selected",
  ] as const) {
    if (node[state] === true) states.push(state);
  }
  if (node.checked === true) states.push("checked");
  if (node.checked === "mixed") states.push("mixed");
  if (node.pressed === true) states.push("pressed");
  return states.slice(0, 8);
}

export function summarizeAccessibilityTree(input: unknown): AccessibilitySummary {
  const root =
    input && typeof input === "object" && !Array.isArray(input) ? (input as TreeNode) : {};
  const nodes: AccessibilityNodeSummary[] = [];
  const headingOutline: Array<{ level: number; name: string }> = [];
  let nodeCount = 0;
  let interactiveCount = 0;
  let unnamedInteractiveCount = 0;
  let mainLandmarkCount = 0;
  let truncated = false;

  const queue: Array<{ node: TreeNode; depth: number }> = [{ node: root, depth: 0 }];
  let queueIndex = 0;
  while (queueIndex < queue.length && nodeCount < MAX_VISITED_NODES) {
    const current = queue[queueIndex];
    queueIndex += 1;
    if (!current) break;
    const { node, depth } = current;
    nodeCount += 1;

    const role = text(node.role, 48) || "generic";
    const rawName = text(node.name);
    const interactive = interactiveRoles.has(role);
    if (role === "main") mainLandmarkCount += 1;
    if (interactive) {
      interactiveCount += 1;
      if (!rawName) unnamedInteractiveCount += 1;
    }

    const level = positiveLevel(node.level);
    if (role === "heading" && level) {
      if (headingOutline.length < 24) {
        headingOutline.push({ level, name: rawName || "Unnamed heading" });
      } else {
        truncated = true;
      }
    }

    if (semanticRoles.has(role)) {
      if (nodes.length < MAX_EXPOSED_NODES) {
        nodes.push({
          role,
          name: rawName || `Unnamed ${role}`,
          ...(level ? { level } : {}),
          states: statesFor(node),
        });
      } else {
        truncated = true;
      }
    }

    if (depth >= MAX_DEPTH || !Array.isArray(node.children)) {
      if (depth >= MAX_DEPTH && Array.isArray(node.children) && node.children.length > 0)
        truncated = true;
      continue;
    }
    let availableSlots = MAX_VISITED_NODES - nodeCount - (queue.length - queueIndex);
    for (const child of node.children) {
      if (availableSlots <= 0) {
        truncated = true;
        break;
      }
      if (child && typeof child === "object" && !Array.isArray(child)) {
        queue.push({ node: child as TreeNode, depth: depth + 1 });
        availableSlots -= 1;
      }
    }
  }

  if (queueIndex < queue.length) truncated = true;

  return {
    rootName: text(root.name) || "Untitled page",
    nodeCount,
    interactiveCount,
    unnamedInteractiveCount,
    mainLandmarkCount,
    truncated,
    headingOutline,
    nodes,
  };
}
