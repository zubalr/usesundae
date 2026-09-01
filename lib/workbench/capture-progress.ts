export const CAPTURE_PROGRESS_STAGES = ["rendering", "measuring", "grouping"] as const;

export type CaptureProgressStage = (typeof CAPTURE_PROGRESS_STAGES)[number];

const LABELS: Record<CaptureProgressStage, string> = {
  rendering: "Rendering the page",
  measuring: "Measuring the page",
  grouping: "Grouping findings",
};

export function captureProgressLabel(stage: CaptureProgressStage) {
  return LABELS[stage];
}
