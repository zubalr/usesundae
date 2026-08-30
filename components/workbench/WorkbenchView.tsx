"use client";

import {
  type Dispatch,
  type FormEventHandler,
  type RefObject,
  type SetStateAction,
  useEffect,
  useState,
} from "react";

import type { JudgedFindingInput } from "@/lib/audit/remote";
import type { AuditSnapshot, CoverageGap, DemoState, Viewport } from "@/lib/audit/types";
import type { RemoteCheckpoint } from "@/lib/capture/types";
import { DECISION_OPTIONS, DECISION_VALUES, type Decision } from "@/lib/workbench/decisions";
import { type EvidenceBoardDescription, verificationLabel } from "@/lib/workbench/evidence";
import {
  activityActorLabel,
  activityTitle,
  type Activity,
  type VisibleFinding,
  type WorkbenchCommands,
} from "@/lib/workbench/types";
import {
  registerWorkbenchTools,
  WEBMCP_REGISTRATION_GRACE_MS,
  WEBMCP_TOOL_COUNTS,
  type WebMcpStatus,
} from "@/lib/webmcp/register";
import { DemoViewport } from "@/components/DemoViewport";
import { Icon } from "@/components/Icons";
import styles from "@/components/Workbench.module.css";

export type TargetMode = "sample" | "remote";

export type JourneyEntry = {
  checkpointId: string;
  scopeId: string;
  label: string;
  displayUrl: string;
  capturedAt: string;
  findingCount: number;
};

type GapDraft = { label: string; detail: string };

const webMcpLabels: Omit<Record<WebMcpStatus, string>, "ready"> = {
  checking: "Checking Site Tools",
  unavailable: "Human controls ready",
  error: "Tool registration failed",
};

function shortTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function WebMcpIndicator({ commands, mode }: { commands: WorkbenchCommands; mode: TargetMode }) {
  const [status, setStatus] = useState<WebMcpStatus>("checking");

  useEffect(() => {
    const controller = new AbortController();
    const fallback = window.setTimeout(
      () => setStatus("unavailable"),
      WEBMCP_REGISTRATION_GRACE_MS,
    );
    setStatus("checking");
    registerWorkbenchTools(commands, controller.signal, mode)
      .then((ready) => setStatus(ready ? "ready" : "unavailable"))
      .catch(() => setStatus("error"))
      .finally(() => window.clearTimeout(fallback));
    return () => {
      window.clearTimeout(fallback);
      controller.abort();
    };
  }, [commands, mode]);

  const label =
    status === "ready" ? `${WEBMCP_TOOL_COUNTS[mode]} page tools ready` : webMcpLabels[status];
  return (
    <div
      className={styles.webmcpStatus}
      data-status={status}
      title={label}
      role="status"
      aria-label={label}
    >
      <span />
      <div>
        <b>WebMCP</b>
        <small>{label}</small>
      </div>
    </div>
  );
}

export type WorkbenchViewProps = {
  mode: TargetMode;
  includedDemoUrl: string;
  auditGoal: string;
  viewport: Viewport;
  demoState: DemoState;
  urlDraft: string;
  waitForSelectorDraft: string;
  draftApproved: boolean;
  cssDraft: string;
  checkpoint: RemoteCheckpoint | null;
  baseline: AuditSnapshot | undefined;
  current: AuditSnapshot | undefined;
  visibleFindings: VisibleFinding[];
  selected: VisibleFinding | null;
  measuredCount: number;
  judgedCount: number;
  evidenceBoard: EvidenceBoardDescription;
  activeGaps: CoverageGap[];
  activity: Activity[];
  activityLimit: number;
  auditing: boolean;
  error: string | null;
  journey: JourneyEntry[];
  decisionReason: string;
  judgmentDraft: JudgedFindingInput;
  gapDraft: GapDraft;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  inspectorRef: RefObject<HTMLElement | null>;
  commands: WorkbenchCommands;
  onAudit: () => void;
  onResetPreview: () => void;
  onInspectAgentSurface: () => void;
  onShowSample: () => void;
  onSubmitCapture: FormEventHandler<HTMLFormElement>;
  onChangeUrlDraft: (value: string) => void;
  onChangeWaitForSelectorDraft: (value: string) => void;
  onApproveUrlDraft: () => void;
  onCaptureJourneyStep: (url: string, label: string) => void;
  onCaptureBelowFold: () => void;
  onOpenJourneyCheckpoint: (entry: JourneyEntry) => void;
  onChangeViewport: (viewport: Viewport) => void;
  onScheduleAudit: () => void;
  onFocusFinding: (findingId: string) => void;
  onSetFindingDecision: (findingId: string, decision: Decision, reason: string) => void;
  onChangeDecisionReason: (value: string) => void;
  onChangeJudgmentDraft: Dispatch<SetStateAction<JudgedFindingInput>>;
  onSubmitManualJudgment: FormEventHandler<HTMLFormElement>;
  onChangeGapDraft: Dispatch<SetStateAction<GapDraft>>;
  onSubmitCoverageGap: FormEventHandler<HTMLFormElement>;
  onChangeCssDraft: (value: string) => void;
  onPreviewFix: (previewCss?: string) => void;
  onVerifyRecapture: (findingId: string) => void;
};

function AuditTopbar({ commands, auditing, mode, checkpoint, onAudit }: WorkbenchViewProps) {
  const awaitingCapture = mode === "remote" && !checkpoint;
  const auditLabel = awaitingCapture
    ? "Awaiting capture"
    : auditing
      ? "Capturing…"
      : mode === "remote"
        ? "Recapture page"
        : "Audit live target";

  return (
    <header className={styles.topbar}>
      <a className={styles.brand} href="#workbench" aria-label="Sundae workbench home">
        <span className={styles.wordmark}>sundae</span>
        <span className={styles.brandRule} />
        <span className={styles.brandCopy}>Evidence for human + agent</span>
      </a>
      <div className={styles.topbarActions}>
        <WebMcpIndicator commands={commands} mode={mode} />
        <button
          className={styles.auditButton}
          type="button"
          disabled={auditing || awaitingCapture}
          onClick={onAudit}
        >
          <Icon name="audit" />
          {auditLabel}
        </button>
      </div>
    </header>
  );
}

function ScopeBar({
  mode,
  checkpoint,
  demoState,
  current,
  auditing,
  onResetPreview,
  onInspectAgentSurface,
  onShowSample,
  onCaptureBelowFold,
}: WorkbenchViewProps) {
  return (
    <section className={styles.contextBar} aria-label="Audit scope">
      <div>
        <span className={styles.liveDot} />{" "}
        <b>{mode === "remote" ? "Managed browser checkpoint" : "Included live target"}</b>
      </div>
      <span className={styles.contextDivider} />
      <code>
        {mode === "remote"
          ? (checkpoint?.target.displayUrl ?? "Preparing checkpoint…")
          : "/demo · Sundae Lab"}
      </code>
      <span className={styles.contextDivider} />
      <span>{demoState === "baseline" ? "Baseline" : "Reversible preview"}</span>
      {current ? (
        <span className={styles.measuredAt}>Captured {shortTime(current.capturedAt)}</span>
      ) : null}
      {demoState === "improved" ? (
        <button type="button" onClick={onResetPreview}>
          <Icon name="undo" /> Reset preview
        </button>
      ) : null}
      {mode === "sample" ? (
        <button type="button" onClick={onInspectAgentSurface}>
          <Icon name="agent" /> Audit agent surface
        </button>
      ) : null}
      {mode === "remote" && checkpoint && demoState === "baseline" ? (
        <button type="button" disabled={auditing} onClick={onCaptureBelowFold}>
          <Icon name="focus" /> Add below-fold
        </button>
      ) : null}
      {mode === "remote" ? (
        <button type="button" onClick={onShowSample}>
          Use sample
        </button>
      ) : null}
    </section>
  );
}

function CaptureBar({
  mode,
  includedDemoUrl,
  checkpoint,
  auditGoal,
  urlDraft,
  waitForSelectorDraft,
  draftApproved,
  auditing,
  journey,
  onSubmitCapture,
  onChangeUrlDraft,
  onChangeWaitForSelectorDraft,
  onApproveUrlDraft,
  onCaptureJourneyStep,
}: WorkbenchViewProps) {
  const hasUrl = Boolean(urlDraft.trim());
  return (
    <form
      className={styles.captureBar}
      onSubmit={onSubmitCapture}
      aria-label="Capture a public website"
    >
      <div className={styles.capturePrompt}>
        <span>Public URL</span>
        <p>
          {auditGoal ? `Goal · ${auditGoal}` : "One public page. No passwords or silent crawling."}
        </p>
      </div>
      <div className={styles.urlCluster}>
        <label className={styles.urlField}>
          <span className={styles.srOnly}>Public page URL</span>
          <input
            type="url"
            value={urlDraft}
            onChange={(event) => onChangeUrlDraft(event.target.value)}
            placeholder="https://your-product.com/page"
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="url"
          />
        </label>
        <label className={styles.urlField}>
          <span className={styles.srOnly}>Wait for CSS selector (optional)</span>
          <input
            type="text"
            value={waitForSelectorDraft}
            maxLength={160}
            onChange={(event) => onChangeWaitForSelectorDraft(event.target.value)}
            placeholder="Wait selector (optional)"
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className={styles.presetUrl}
          onClick={() => onChangeUrlDraft(includedDemoUrl)}
          aria-label="Fill the included Sundae demo target without capturing"
        >
          included /demo
        </button>
      </div>
      <div className={styles.captureActions}>
        {mode === "remote" ? (
          <button
            type="button"
            disabled={auditing || !hasUrl || draftApproved}
            onClick={onApproveUrlDraft}
          >
            <Icon name="agent" /> {draftApproved ? "Agent allowed" : "Allow ChatGPT"}
          </button>
        ) : null}
        <button type="submit" disabled={auditing || !hasUrl}>
          <Icon name="focus" /> {mode === "remote" && checkpoint ? "New audit" : "Capture page"}
        </button>
        {mode === "remote" ? (
          <button
            type="button"
            disabled={auditing || !hasUrl || !checkpoint}
            onClick={() => onCaptureJourneyStep(urlDraft, `Step ${journey.length + 1}`)}
          >
            <Icon name="spark" /> Add step
          </button>
        ) : null}
      </div>
    </form>
  );
}

function JourneyBar({ mode, journey, checkpoint, onOpenJourneyCheckpoint }: WorkbenchViewProps) {
  if (mode !== "remote") return null;
  return (
    <section className={styles.journeyBar} aria-label="Captured scope trail">
      <span>
        Scope trail · {journey.length} {journey.length === 1 ? "checkpoint" : "checkpoints"}
      </span>
      <ol>
        {journey.map((entry, index) => (
          <li key={entry.checkpointId}>
            <button
              type="button"
              title={entry.displayUrl}
              data-current={entry.checkpointId === checkpoint?.id}
              aria-pressed={entry.checkpointId === checkpoint?.id}
              onClick={() => onOpenJourneyCheckpoint(entry)}
            >
              <b>{index + 1}</b>
              <span>{entry.label}</span>
              <small>{entry.findingCount} facts</small>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProductPane({
  mode,
  viewport,
  demoState,
  checkpoint,
  visibleFindings,
  selected,
  auditing,
  error,
  iframeRef,
  onChangeViewport,
  onScheduleAudit,
  onFocusFinding,
}: WorkbenchViewProps) {
  const awaitingCapture = mode === "remote" && !checkpoint;
  return (
    <section className={styles.productPane} aria-labelledby="live-product-title">
      <div className={styles.paneHead}>
        <div>
          <h1 id="live-product-title">
            {awaitingCapture
              ? "Public capture ready"
              : mode === "remote"
                ? "Rendered product"
                : "Live product"}
          </h1>
          <p>
            {awaitingCapture
              ? "The exact target is prefilled above. Capture it before Sundae creates evidence."
              : mode === "remote"
                ? "Screenshot, text, and accessibility evidence from one bounded checkpoint."
                : "Measured directly from the rendered document in this browser."}
          </p>
        </div>
        <div className={styles.viewportSwitch} role="group" aria-label="Audit viewport">
          <button
            type="button"
            data-active={viewport === "mobile"}
            aria-pressed={viewport === "mobile"}
            disabled={auditing || awaitingCapture}
            onClick={() => onChangeViewport("mobile")}
          >
            <Icon name="mobile" /> Mobile
          </button>
          <button
            type="button"
            data-active={viewport === "desktop"}
            aria-pressed={viewport === "desktop"}
            disabled={auditing || awaitingCapture}
            onClick={() => onChangeViewport("desktop")}
          >
            <Icon name="desktop" /> Desktop
          </button>
        </div>
      </div>

      <DemoViewport
        iframeRef={iframeRef}
        viewport={viewport}
        demoState={demoState}
        checkpoint={mode === "remote" ? checkpoint : null}
        pending={awaitingCapture}
        findings={visibleFindings}
        selectedId={selected?.id ?? null}
        auditing={auditing}
        onLoad={onScheduleAudit}
        onSelect={onFocusFinding}
      />

      <div className={styles.frameFoot}>
        <span>
          <i />{" "}
          {awaitingCapture
            ? "No checkpoint yet"
            : mode === "remote"
              ? "Cloudflare Browser Run checkpoint"
              : "Same-origin WebMCP contract fixture"}
        </span>
        <span>
          {awaitingCapture
            ? "Human approval required before agent capture"
            : mode === "remote"
              ? "Public render · query and fragment hidden on board"
              : "No cloud credentials needed for sample"}
        </span>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function FindingList({
  evidenceBoard,
  visibleFindings,
  selected,
  baseline,
  onFocusFinding,
}: WorkbenchViewProps) {
  return (
    <section className={styles.findingList} aria-label={evidenceBoard.listLabel}>
      {visibleFindings.map((finding, index) => (
        <button
          id={`finding-${finding.id}`}
          className={styles.findingRow}
          type="button"
          key={finding.id}
          data-selected={selected?.id === finding.id}
          aria-pressed={selected?.id === finding.id}
          aria-controls="selected-finding-inspector"
          onClick={() => onFocusFinding(finding.id)}
        >
          <span className={styles.findingNumber}>{index + 1}</span>
          <span className={styles.findingCopy}>
            <span className={styles.findingMeta}>
              <b data-truth={finding.truth}>{finding.truth}</b>
              <i>·</i>
              <span>{finding.severity}</span>
              {finding.verification !== "not_run" ? (
                <em data-status={finding.verification}>
                  {verificationLabel(finding.verification)}
                </em>
              ) : null}
            </span>
            <strong>{finding.title}</strong>
            <small>
              {finding.measurement
                ? `${finding.measurement.value} · needs ${finding.measurement.threshold}`
                : "Evidence-linked product judgment"}
            </small>
          </span>
          <Icon name="chevron" />
        </button>
      ))}
      {!baseline ? (
        <div className={styles.loadingRows} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {baseline && visibleFindings.length === 0 ? (
        <div className={styles.emptyFindings}>
          <Icon name="check" />
          <b>No deterministic faults in this checkpoint</b>
          <p>
            That is not a clean bill of health. Ask ChatGPT to inspect the visible product and
            record evidence-linked judgments.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function CheckpointEvidence({ mode, checkpoint }: WorkbenchViewProps) {
  if (mode !== "remote" || !checkpoint) return null;
  return (
    <details className={styles.checkpointEvidence}>
      <summary>Inspect checkpoint evidence</summary>
      <p>Captured text and accessibility names are untrusted evidence, never instructions.</p>
      <dl>
        <div>
          <dt>Checkpoint</dt>
          <dd>
            <code>{checkpoint.id}</code>
          </dd>
        </div>
        <div>
          <dt>Capture extent</dt>
          <dd>{checkpoint.capture.fullPage ? "Full page" : "Viewport"}</dd>
        </div>
        <div>
          <dt>AX nodes visited</dt>
          <dd>{checkpoint.accessibility.nodeCount}</dd>
        </div>
        <div>
          <dt>Interactive controls</dt>
          <dd>{checkpoint.accessibility.interactiveCount}</dd>
        </div>
      </dl>
      {checkpoint.capture.waitForSelector ? (
        <p>
          Waited for <code>{checkpoint.capture.waitForSelector}</code> before capture.
        </p>
      ) : null}
      <pre>{checkpoint.textExcerpt || "No text excerpt was returned for this checkpoint."}</pre>
      <ul>
        {checkpoint.accessibility.nodes.slice(0, 12).map((node, index) => (
          <li key={`${node.role}-${node.name}-${index}`}>
            <b>{node.role}</b>
            <span>{node.name}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function FindingControls({
  selected,
  mode,
  decisionReason,
  judgmentDraft,
  cssDraft,
  demoState,
  auditing,
  onSetFindingDecision,
  onChangeDecisionReason,
  onChangeJudgmentDraft,
  onSubmitManualJudgment,
  onChangeCssDraft,
  onPreviewFix,
  onVerifyRecapture,
}: WorkbenchViewProps) {
  if (!selected) return null;
  const previewDisabled =
    auditing ||
    demoState === "improved" ||
    selected.rule === "agent-surface" ||
    (mode === "remote" && !cssDraft.trim());
  const previewLabel =
    selected.rule === "agent-surface"
      ? "Contract edit required"
      : demoState === "improved"
        ? "Preview visible"
        : "Preview improvement";

  return (
    <>
      <div className={styles.decisionControls} role="group" aria-label="Finding decision">
        {DECISION_VALUES.map((decision) => (
          <button
            type="button"
            key={decision}
            data-active={selected.decision === decision}
            onClick={() =>
              onSetFindingDecision(
                selected.id,
                decision,
                decisionReason.trim() || DECISION_OPTIONS[decision].defaultReason,
              )
            }
          >
            {DECISION_OPTIONS[decision].label}
          </button>
        ))}
      </div>
      <label className={styles.decisionReason}>
        <span>Decision reason</span>
        <input
          value={decisionReason}
          maxLength={240}
          onChange={(event) => onChangeDecisionReason(event.target.value)}
          placeholder="Add your evidence-based reason"
        />
      </label>

      <details className={styles.manualEvidence}>
        <summary>Add a human visual judgment</summary>
        <form onSubmit={onSubmitManualJudgment}>
          <label>
            <span>Title</span>
            <input
              required
              maxLength={140}
              value={judgmentDraft.title}
              onChange={(event) =>
                onChangeJudgmentDraft((draft) => ({ ...draft, title: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Observed</span>
            <textarea
              required
              maxLength={360}
              rows={2}
              value={judgmentDraft.observation}
              onChange={(event) =>
                onChangeJudgmentDraft((draft) => ({ ...draft, observation: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Why it may matter</span>
            <textarea
              required
              maxLength={300}
              rows={2}
              value={judgmentDraft.whyItMatters}
              onChange={(event) =>
                onChangeJudgmentDraft((draft) => ({ ...draft, whyItMatters: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Recommendation</span>
            <textarea
              required
              maxLength={300}
              rows={2}
              value={judgmentDraft.recommendation}
              onChange={(event) =>
                onChangeJudgmentDraft((draft) => ({ ...draft, recommendation: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Severity</span>
            <select
              value={judgmentDraft.severity}
              onChange={(event) =>
                onChangeJudgmentDraft((draft) => ({
                  ...draft,
                  severity: event.target.value as JudgedFindingInput["severity"],
                }))
              }
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <button type="submit" disabled={demoState !== "baseline"}>
            Record judgment
          </button>
        </form>
      </details>

      {mode === "remote" ? (
        <div className={styles.previewComposer}>
          <label htmlFor="preview-css">Reversible CSS preview</label>
          <textarea
            id="preview-css"
            value={cssDraft}
            onChange={(event) => onChangeCssDraft(event.target.value)}
            placeholder={"e.g. .primary-action { min-height: 2.75rem; font-weight: 700; }"}
            rows={3}
          />
          <p>Visual-only, rendered in a fresh checkpoint. The source website is never edited.</p>
        </div>
      ) : null}

      <div className={styles.verifyActions}>
        <button
          type="button"
          className={styles.previewButton}
          disabled={previewDisabled}
          onClick={() => onPreviewFix(mode === "remote" ? cssDraft : undefined)}
        >
          <Icon name="spark" /> {previewLabel}
        </button>
        <button
          type="button"
          className={styles.verifyButton}
          disabled={auditing}
          onClick={() => onVerifyRecapture(selected.id)}
        >
          <Icon name="refresh" /> Verify recapture
        </button>
      </div>
    </>
  );
}

function FindingInspector({ selected, inspectorRef, ...props }: WorkbenchViewProps) {
  if (!selected) return null;

  return (
    <article
      className={styles.inspector}
      id="selected-finding-inspector"
      ref={inspectorRef}
      tabIndex={-1}
      aria-labelledby="selected-title"
    >
      <div className={styles.inspectorTop}>
        <span className={styles.truthBadge} data-truth={selected.truth}>
          {selected.truth}
        </span>
        <code>{selected.id}</code>
        <span className={styles.decisionBadge} data-decision={selected.decision}>
          {DECISION_OPTIONS[selected.decision].label}
        </span>
      </div>
      <h3 id="selected-title">{selected.title}</h3>
      <p className={styles.observation}>{selected.observation}</p>
      {selected.evidence ? (
        <p className={styles.evidenceRef}>
          Evidence · {selected.evidence.kind} · <code>{selected.evidence.ref}</code>
        </p>
      ) : null}

      {selected.measurement ? (
        <dl className={styles.measurement}>
          <div>
            <dt>Observed</dt>
            <dd>{selected.measurement.value}</dd>
          </div>
          <div>
            <dt>Threshold</dt>
            <dd>{selected.measurement.threshold}</dd>
          </div>
          <div>
            <dt>Viewport</dt>
            <dd>{selected.viewport}</dd>
          </div>
        </dl>
      ) : null}

      <div className={styles.reasoning}>
        <div>
          <h4>Why it may matter</h4>
          <p>{selected.whyItMatters}</p>
        </div>
        <div>
          <h4>Recommended change</h4>
          <p>{selected.recommendation}</p>
        </div>
      </div>

      <CheckpointEvidence selected={selected} inspectorRef={inspectorRef} {...props} />

      {selected.verificationReceipt ? (
        <div
          className={styles.verificationReceipt}
          data-status={selected.verificationReceipt.status}
        >
          <Icon name={selected.verificationReceipt.status === "fixed" ? "check" : "refresh"} />
          <div>
            <b>{verificationLabel(selected.verificationReceipt.status)}</b>
            <span>
              {selected.verificationReceipt.before} → {selected.verificationReceipt.after}
            </span>
          </div>
        </div>
      ) : null}

      <FindingControls selected={selected} inspectorRef={inspectorRef} {...props} />
    </article>
  );
}

function CoveragePanel({
  activeGaps,
  gapDraft,
  onChangeGapDraft,
  onSubmitCoverageGap,
}: WorkbenchViewProps) {
  return (
    <section className={styles.gaps} aria-labelledby="gaps-title">
      <div className={styles.subhead}>
        <h3 id="gaps-title">Not seen</h3>
        <span>{activeGaps.length} coverage gaps</span>
      </div>
      {activeGaps.map((gap) => (
        <div key={gap.id}>
          <b>{gap.label}</b>
          <p>{gap.detail}</p>
        </div>
      ))}
      {activeGaps.length === 0 ? (
        <p className={styles.emptyCopy}>
          No gaps have been named yet. This does not mean coverage is complete.
        </p>
      ) : null}
      <details className={styles.manualGap}>
        <summary>Add a coverage gap</summary>
        <form onSubmit={onSubmitCoverageGap}>
          <label>
            <span>Surface not seen</span>
            <input
              required
              maxLength={100}
              value={gapDraft.label}
              onChange={(event) =>
                onChangeGapDraft((draft) => ({ ...draft, label: event.target.value }))
              }
            />
          </label>
          <label>
            <span>What remains unknown</span>
            <textarea
              required
              maxLength={300}
              rows={2}
              value={gapDraft.detail}
              onChange={(event) =>
                onChangeGapDraft((draft) => ({ ...draft, detail: event.target.value }))
              }
            />
          </label>
          <button type="submit">Record gap</button>
        </form>
      </details>
    </section>
  );
}

function ActivityReceipts({ activity, activityLimit }: WorkbenchViewProps) {
  return (
    <section className={styles.receipts} aria-labelledby="receipts-title">
      <div className={styles.subhead}>
        <h3 id="receipts-title">Action receipts</h3>
        <span>
          Last {Math.min(activity.length, 20)} · retains {activityLimit}
        </span>
      </div>
      <ol>
        {activity.slice(0, 20).map((entry) => (
          <li key={entry.id}>
            <span data-actor={entry.actor} role="img" aria-label={activityActorLabel(entry.actor)}>
              {entry.actor === "agent" ? (
                <Icon name="agent" />
              ) : (
                entry.actor.slice(0, 1).toUpperCase()
              )}
            </span>
            <div>
              <b>{activityTitle(entry)}</b>
              <p>{entry.detail}</p>
            </div>
            <time dateTime={entry.at}>{shortTime(entry.at)}</time>
          </li>
        ))}
        {activity.length === 0 ? (
          <li className={styles.emptyReceipt}>The first capture will appear here.</li>
        ) : null}
      </ol>
    </section>
  );
}

function EvidencePane(props: WorkbenchViewProps) {
  const { evidenceBoard, measuredCount, judgedCount } = props;
  return (
    <section className={styles.evidencePane} aria-labelledby="evidence-title">
      <div className={styles.evidenceHead}>
        <div>
          <h2 id="evidence-title">Evidence board</h2>
          <p aria-live="polite">{evidenceBoard.summary}</p>
        </div>
        <div className={styles.truthSummary}>
          <span className={styles.truthContext}>{evidenceBoard.truthLabel}</span>
          <span>
            <i data-truth="measured" />
            {measuredCount} measured
          </span>
          <span>
            <i data-truth="judged" />
            {judgedCount} judged
          </span>
        </div>
      </div>
      <FindingList {...props} />
      <FindingInspector {...props} />
      <CoveragePanel {...props} />
      <ActivityReceipts {...props} />
    </section>
  );
}

export function WorkbenchView(props: WorkbenchViewProps) {
  return (
    <section className={styles.app} data-mode={props.mode} aria-label="Sundae audit workbench">
      <AuditTopbar {...props} />
      <ScopeBar {...props} />
      <CaptureBar {...props} />
      <JourneyBar {...props} />
      <div className={styles.workbench} id="workbench">
        <ProductPane {...props} />
        <EvidencePane {...props} />
      </div>
    </section>
  );
}
