"use client";

import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import type { DemoState, Viewport } from "@/lib/audit/types";
import type { RemoteCheckpoint } from "@/lib/capture/types";
import type { CaptureProgressStage } from "@/lib/workbench/capture-progress";
import { captureProgressLabel } from "@/lib/workbench/capture-progress";
import type { VisibleFinding } from "@/lib/workbench/types";
import styles from "./DemoViewport.module.css";

const SIZES = {
  mobile: { width: 390, height: 700 },
  desktop: { width: 1120, height: 700 },
} as const;

type DemoViewportProps = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  viewport: Viewport;
  demoState: DemoState;
  checkpoint: RemoteCheckpoint | null;
  pending: boolean;
  captureProgress?: CaptureProgressStage | null;
  findings: VisibleFinding[];
  selectedId: string | null;
  auditing: boolean;
  onLoad: () => void;
  onSelect: (findingId: string) => void;
};

export function DemoViewport({
  iframeRef,
  viewport,
  demoState,
  checkpoint,
  pending,
  captureProgress = null,
  findings,
  selectedId,
  auditing,
  onLoad,
  onSelect,
}: DemoViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const size = checkpoint?.viewportSize ?? SIZES[viewport];

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const update = () => {
      const available = Math.max(280, host.clientWidth - 28);
      setScale(Math.min(1, available / size.width));
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, [size.width]);

  return (
    <div
      className={styles.host}
      ref={hostRef}
      style={{ height: Math.ceil(size.height * scale) + 28 }}
      data-viewport={viewport}
    >
      <div
        className={styles.scaledSlot}
        style={{ width: size.width * scale, height: size.height * scale }}
      >
        <div
          className={styles.canvas}
          style={{ width: size.width, height: size.height, transform: `scale(${scale})` }}
        >
          {pending ? (
            <div className={styles.pendingCapture} role="status">
              <span>
                {captureProgress ? captureProgressLabel(captureProgress) : "Capture in progress"}
              </span>
              <strong>
                {captureProgress
                  ? "The human-supplied target is approved for this session."
                  : "The requested page has not been inspected."}
              </strong>
              <p>
                {captureProgress
                  ? "Cancel if you need to stop this capture."
                  : "Sundae will capture the approved public target for this session."}
              </p>
            </div>
          ) : checkpoint ? (
            <img
              className={styles.captureImage}
              src={checkpoint.screenshotDataUrl}
              alt={`Rendered checkpoint of ${checkpoint.title}`}
              width={size.width}
              height={size.height}
            />
          ) : (
            <iframe
              ref={iframeRef}
              className={styles.frame}
              src={`/demo?state=${demoState}`}
              title={`Sundae Lab target — ${demoState} state`}
              width={size.width}
              height={size.height}
              allow="tools"
              scrolling="no"
              aria-hidden="true"
              tabIndex={-1}
              sandbox="allow-same-origin allow-scripts"
              onLoad={onLoad}
            />
          )}

          <div className={styles.overlay} role="group" aria-label="Measured finding pins">
            {findings.map((finding, index) => {
              if (!finding.rect) return null;
              const { x, y, width, height } = finding.rect;
              const minimumLogicalHit = 44 / Math.max(scale, 0.01);
              const hitWidth = Math.max(width + 14, minimumLogicalHit);
              const hitHeight = Math.max(height + 14, minimumLogicalHit);
              return (
                <button
                  className={styles.pin}
                  type="button"
                  key={finding.id}
                  data-selected={selectedId === finding.id ? "true" : "false"}
                  data-verified={finding.verification === "fixed" ? "true" : "false"}
                  aria-pressed={selectedId === finding.id}
                  aria-controls="selected-finding-inspector"
                  style={
                    {
                      left: Math.max(0, x - (hitWidth - width) / 2),
                      top: Math.max(0, y - (hitHeight - height) / 2),
                      width: hitWidth,
                      height: hitHeight,
                      "--box-x": `${(hitWidth - width) / 2}px`,
                      "--box-y": `${(hitHeight - height) / 2}px`,
                      "--box-w": `${width}px`,
                      "--box-h": `${height}px`,
                    } as React.CSSProperties
                  }
                  aria-label={`Focus ${finding.id}: ${finding.title}`}
                  onClick={() => onSelect(finding.id)}
                >
                  <span className={styles.pinBox} />
                  <b>{index + 1}</b>
                </button>
              );
            })}
          </div>

          {auditing ? <div className={styles.scanLine} aria-hidden="true" /> : null}
        </div>
      </div>
    </div>
  );
}
