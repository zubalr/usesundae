"use client";

import {
  type CSSProperties,
  type Dispatch,
  type FormEventHandler,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import type { JudgedFindingInput } from "@/lib/audit/remote";
import type {
  AuditBrief,
  AuditBriefInput,
  AuditSnapshot,
  DemoState,
  ReviewResult,
  ReviewResultInput,
  Viewport,
} from "@/lib/audit/types";
import { hasDefensibleThreshold } from "@/lib/audit/types";
import type { RemoteCheckpoint } from "@/lib/capture/types";
import {
  findFindingSurface,
  type CoverageSummary,
  type CoverageTrailEntry,
} from "@/lib/workbench/coverage";
import { DECISION_OPTIONS, DECISION_VALUES, type Decision } from "@/lib/workbench/decisions";
import {
  describeAgentAuthority,
  describeHostToolCount,
  type EvidenceBoardDescription,
  verificationLabel,
} from "@/lib/workbench/evidence";
import { captureProgressLabel, type CaptureProgressStage } from "@/lib/workbench/capture-progress";
import { describeCaptureApproval } from "@/lib/workbench/approval";
import { evaluatePreviewAuthority } from "@/lib/workbench/preview-authority";
import {
  activityActorLabel,
  activityTitle,
  countAgentToolCalls,
  type Activity,
  type VisibleFinding,
  type WorkbenchCommands,
} from "@/lib/workbench/types";
import {
  confirmedWorkbenchToolCount,
  registerWorkbenchTools,
  WEBMCP_REGISTRATION_GRACE_MS,
  WEBMCP_TOOL_COUNTS,
  type WebMcpStatus,
} from "@/lib/webmcp/register";
import { useAuditIntent } from "@/components/AuditIntent";
import { DemoViewport } from "@/components/DemoViewport";
import { Icon } from "@/components/Icons";
import styles from "@/components/Workbench.module.css";
import {
  buildChatGptComposerUrl,
  buildChatGptHandoffPrompt,
  buildWorkspaceUrl,
  createAuditLaunch,
} from "@/lib/launch";

export type TargetMode = "sample" | "remote";

export type JourneyEntry = CoverageTrailEntry;

type GapDraft = { label: string; detail: string };
type ToolRegistrationState = { mode: TargetMode; status: WebMcpStatus };

const webMcpLabels: Omit<Record<WebMcpStatus, string>, "ready"> = {
  checking: "Checking Site Tools",
  unavailable: "Human controls ready",
  error: "Tool registration failed",
};

const productPaneTitles: Record<TargetMode, string> = {
  remote: "Product",
  sample: "Sample review",
};

function shortTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function WebMcpIndicator({
  commands,
  mode,
  status,
  hostToolCount,
  onStatusChange,
}: {
  commands: WorkbenchCommands;
  mode: TargetMode;
  status: WebMcpStatus;
  hostToolCount: number | null;
  onStatusChange: Dispatch<SetStateAction<ToolRegistrationState>>;
}) {
  useEffect(() => {
    const controller = new AbortController();
    const report = (nextStatus: WebMcpStatus) => {
      if (controller.signal.aborted) return;
      onStatusChange({ mode, status: nextStatus });
    };
    const fallback = window.setTimeout(() => report("unavailable"), WEBMCP_REGISTRATION_GRACE_MS);
    report("checking");
    registerWorkbenchTools(commands, controller.signal, mode)
      .then((ready) => report(ready ? "ready" : "unavailable"))
      .catch(() => report("error"))
      .finally(() => window.clearTimeout(fallback));
    return () => {
      window.clearTimeout(fallback);
      controller.abort();
    };
  }, [commands, mode, onStatusChange]);

  const label =
    status === "ready"
      ? describeHostToolCount(WEBMCP_TOOL_COUNTS[mode], hostToolCount)
      : webMcpLabels[status];
  return (
    <div
      className={styles.webmcpStatus}
      data-status={status}
      title={label}
      role="status"
      aria-label={label}
    >
      <span aria-hidden="true" />
      <b>{status === "ready" ? "Site Tools ready" : webMcpLabels[status]}</b>
    </div>
  );
}

function AgentAuthority({
  mode,
  checkpoint,
  current,
  urlDraft,
  draftApproved,
  activity,
  hostToolCount,
}: WorkbenchViewProps & { hostToolCount: number | null }) {
  const authority = describeAgentAuthority(mode, checkpoint, current?.scopeKey);
  const target = mode === "remote" ? checkpoint?.target.displayUrl || urlDraft : "/demo";
  const tools = describeHostToolCount(WEBMCP_TOOL_COUNTS[mode], hostToolCount);
  const approval = describeCaptureApproval({
    mode,
    hasCheckpoint: Boolean(checkpoint),
    currentUrlApproved: draftApproved,
  });

  return (
    <details className={styles.authorityBar} aria-label="Agent authority">
      <summary>
        {authority.label} · {target} · {tools} · {authority.scope}
      </summary>
      <p className={styles.agentCallCount} aria-live="polite">
        Agent tool calls: {countAgentToolCalls(activity)}
      </p>
      <dl>
        <div>
          <dt>Target</dt>
          <dd title={target}>{target}</dd>
        </div>
        <div>
          <dt>Tools</dt>
          <dd>{tools}</dd>
        </div>
        <div>
          <dt>Approval</dt>
          <dd>{approval}</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd title={authority.scopeTitle}>{authority.scope}</dd>
        </div>
        <div>
          <dt>Boundaries</dt>
          <dd>Agent may inspect and record; person decides and approves previews</dd>
        </div>
        <div>
          <dt>Lifetime</dt>
          <dd>Current browser session only</dd>
        </div>
      </dl>
    </details>
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
  auditBrief: AuditBrief | null;
  reviewResults: ReviewResult[];
  activePreviewFindingId: string | null;
  coverage: CoverageSummary;
  evidenceBoard: EvidenceBoardDescription;
  activeGaps: CoverageSummary["openGaps"];
  activity: Activity[];
  activityLimit: number;
  auditing: boolean;
  captureProgress: CaptureProgressStage | null;
  error: string | null;
  journey: JourneyEntry[];
  uncapturedNav: Array<{ url: string; label: string }>;
  decisionReason: string;
  judgmentDraft: JudgedFindingInput;
  gapDraft: GapDraft;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  inspectorRef: RefObject<HTMLElement | null>;
  commands: WorkbenchCommands;
  sidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
  onAudit: () => void;
  onResetPreview: () => void;
  onInspectAgentSurface: () => void;
  onShowSample: () => void;
  onSubmitCapture: FormEventHandler<HTMLFormElement>;
  onChangeUrlDraft: (value: string) => void;
  onChangeWaitForSelectorDraft: (value: string) => void;
  onCancelCapture: () => void;
  onCaptureJourneyStep: (url: string, label: string) => void;
  onCaptureVisibleNav: () => void;
  onCaptureBelowFold: () => void;
  onOpenJourneyCheckpoint: (entry: JourneyEntry) => void;
  onChangeViewport: (viewport: Viewport) => void;
  onScheduleAudit: () => void;
  onFocusFinding: (findingId: string) => void;
  onSetFindingDecision: (findingId: string, decision: Decision, reason: string) => void;
  onChangeDecisionReason: (value: string) => void;
  onChangeJudgmentDraft: Dispatch<SetStateAction<JudgedFindingInput>>;
  onSubmitManualJudgment: FormEventHandler<HTMLFormElement>;
  onRecordAuditBrief: (input: AuditBriefInput) => void;
  onRecordReviewResult: (input: ReviewResultInput) => Promise<boolean>;
  onChangeGapDraft: Dispatch<SetStateAction<GapDraft>>;
  onSubmitCoverageGap: FormEventHandler<HTMLFormElement>;
  onChangeCssDraft: (value: string) => void;
  onPreviewFix: (previewCss?: string) => void;
  onVerifyRecapture: (findingId: string) => void;
};

function AuditTopbar({
  commands,
  auditing,
  captureProgress,
  mode,
  checkpoint,
  onAudit,
  onCancelCapture,
  toolStatus,
  hostToolCount,
  onToolStatusChange,
  measuredCount,
  judgedCount,
  sidebarOpen,
  onToggleSidebar,
  sidebarToggleRef,
}: WorkbenchViewProps & {
  toolStatus: WebMcpStatus;
  hostToolCount: number | null;
  onToolStatusChange: Dispatch<SetStateAction<ToolRegistrationState>>;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  sidebarToggleRef: RefObject<HTMLButtonElement | null>;
}) {
  const awaitingCapture = mode === "remote" && !checkpoint;
  const findingCount = measuredCount + judgedCount;
  const auditLabel = captureProgress
    ? captureProgressLabel(captureProgress)
    : awaitingCapture
      ? "Awaiting capture"
      : auditing
        ? "Capturing…"
        : "Refresh evidence";

  return (
    <header className={styles.topbar}>
      <a className={styles.brand} href="#workbench" aria-label="Sundae workbench home">
        <span className={styles.wordmark}>sundae</span>
      </a>
      <div className={styles.topbarActions}>
        <WebMcpIndicator
          commands={commands}
          mode={mode}
          status={toolStatus}
          hostToolCount={hostToolCount}
          onStatusChange={onToolStatusChange}
        />
        <button
          ref={sidebarToggleRef}
          className={styles.sidebarToggle}
          type="button"
          aria-expanded={sidebarOpen}
          aria-controls="evidence-pane"
          aria-label={`${sidebarOpen ? "Hide" : "Show"} findings panel, ${findingCount} findings`}
          onClick={onToggleSidebar}
        >
          {sidebarOpen ? "Findings" : "Show findings"} <span>{findingCount}</span>
        </button>
        {captureProgress ? (
          <button className={styles.auditButton} type="button" onClick={onCancelCapture}>
            Cancel
          </button>
        ) : (
          <button
            className={styles.auditButton}
            type="button"
            disabled={auditing || awaitingCapture}
            onClick={onAudit}
          >
            <Icon name="audit" />
            {auditLabel}
          </button>
        )}
      </div>
    </header>
  );
}

function TargetForm({
  mode,
  includedDemoUrl,
  checkpoint,
  urlDraft,
  waitForSelectorDraft,
  auditing,
  captureProgress,
  journey,
  onSubmitCapture,
  onChangeUrlDraft,
  onChangeWaitForSelectorDraft,
  onCancelCapture,
  onCaptureJourneyStep,
  onShowSample,
  onDismiss,
}: WorkbenchViewProps & { onDismiss: () => void }) {
  const hasUrl = Boolean(urlDraft.trim());
  const dismissable = mode === "sample" || Boolean(checkpoint);
  return (
    <form
      id="capture-target-form"
      className={styles.captureBar}
      onSubmit={onSubmitCapture}
      aria-label="Capture a public website"
    >
      <div className={styles.urlCluster}>
        <label className={styles.urlField}>
          <span className={styles.srOnly}>Public page URL</span>
          <input
            type="text"
            inputMode="url"
            value={urlDraft}
            onChange={(event) => onChangeUrlDraft(event.target.value)}
            placeholder="yourproduct.com or www.example.com/pricing"
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="url"
          />
        </label>
        <label className={styles.urlField} data-role="wait">
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
      </div>
      <div className={styles.captureActions}>
        {captureProgress ? (
          <button type="button" onClick={onCancelCapture}>
            Cancel
          </button>
        ) : (
          <button type="submit" disabled={auditing || !hasUrl}>
            <Icon name="focus" /> Capture
          </button>
        )}
        {mode === "remote" && checkpoint ? (
          <button
            type="button"
            disabled={auditing || !hasUrl}
            onClick={() => onCaptureJourneyStep(urlDraft, `Step ${journey.length + 1}`)}
          >
            <Icon name="spark" /> Add step
          </button>
        ) : null}
        <button
          type="button"
          className={styles.presetUrl}
          onClick={() => onChangeUrlDraft(includedDemoUrl)}
          aria-label="Fill the included Sundae demo target without capturing"
        >
          included /demo
        </button>
        {mode === "remote" ? (
          <button type="button" className={styles.presetUrl} onClick={onShowSample}>
            Use sample
          </button>
        ) : null}
        {dismissable ? (
          <button type="button" className={styles.presetUrl} onClick={onDismiss}>
            Close
          </button>
        ) : null}
      </div>
    </form>
  );
}

function ProductPane(
  props: WorkbenchViewProps & {
    captureFormOpen: boolean;
    onToggleCaptureForm: () => void;
  },
) {
  const {
    mode,
    viewport,
    demoState,
    checkpoint,
    current,
    visibleFindings,
    selected,
    auditing,
    captureProgress,
    error,
    iframeRef,
    onChangeViewport,
    onResetPreview,
    onScheduleAudit,
    onFocusFinding,
    captureFormOpen,
    onToggleCaptureForm,
  } = props;
  const awaitingCapture = mode === "remote" && !checkpoint;
  const progressLabel = captureProgress ? captureProgressLabel(captureProgress) : null;
  const target =
    mode === "remote"
      ? (checkpoint?.target.displayUrl ?? "Preparing checkpoint…")
      : "/demo · Sundae Lab";
  const title = progressLabel ?? (awaitingCapture ? "Capture a page" : productPaneTitles[mode]);
  const stateLabel = demoState === "baseline" ? "Baseline" : "Preview";
  const targetLabel = `${target}, ${stateLabel}${current ? `, captured ${shortTime(current.capturedAt)}` : ""}`;
  const targetChipContent = (
    <>
      <span className={styles.liveDot} aria-hidden="true" />
      <span className={styles.targetUrl}>{target}</span>
      <span>{stateLabel}</span>
    </>
  );
  return (
    <section className={styles.productPane} aria-labelledby="live-product-title">
      <div className={styles.paneHead}>
        <div className={styles.paneIdentity}>
          <h1 id="live-product-title">{title}</h1>
          {awaitingCapture ? (
            <div className={styles.targetChip} data-static="true" title={targetLabel}>
              {targetChipContent}
            </div>
          ) : (
            <button
              type="button"
              className={styles.targetChip}
              aria-expanded={captureFormOpen}
              aria-controls="capture-target-form"
              aria-label={`${captureFormOpen ? "Hide" : "Show"} target controls for ${targetLabel}`}
              title={targetLabel}
              onClick={onToggleCaptureForm}
            >
              {targetChipContent}
            </button>
          )}
        </div>
        <div className={styles.paneActions}>
          {demoState === "improved" ? (
            <button type="button" className={styles.chipAction} onClick={onResetPreview}>
              <Icon name="undo" /> Reset preview
            </button>
          ) : null}
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
        {awaitingCapture ? (
          <p>The public URL below is approved for this session. Capture it to start.</p>
        ) : progressLabel ? (
          <p aria-live="polite">{progressLabel}</p>
        ) : null}
      </div>

      {captureFormOpen ? <TargetForm {...props} onDismiss={onToggleCaptureForm} /> : null}

      <DemoViewport
        iframeRef={iframeRef}
        viewport={viewport}
        demoState={demoState}
        checkpoint={mode === "remote" ? checkpoint : null}
        pending={awaitingCapture}
        captureProgress={captureProgress}
        findings={visibleFindings}
        selectedId={selected?.id ?? null}
        auditing={auditing}
        onLoad={onScheduleAudit}
        onSelect={onFocusFinding}
      />

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function formText(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function AuditBriefPanel({
  auditBrief,
  auditGoal,
  baseline,
  checkpoint,
  demoState,
  onRecordAuditBrief,
}: WorkbenchViewProps) {
  const evidenceRef = checkpoint?.id ?? "included-live-target";
  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onRecordAuditBrief({
      productCategory: formText(data, "product-category"),
      audience: formText(data, "audience"),
      productJob: formText(data, "product-job"),
      visibleProposition: formText(data, "visible-proposition"),
      primaryAction: formText(data, "primary-action"),
      confidence: formText(data, "brief-confidence") as AuditBriefInput["confidence"],
      evidenceRefs: [evidenceRef],
      unresolvedQuestions: formText(data, "unresolved-questions")
        .split("\n")
        .map((question) => question.trim())
        .filter(Boolean)
        .slice(0, 6),
    });
  };

  return (
    <section className={styles.auditBrief} aria-labelledby="audit-brief-title">
      <details>
        <summary className={styles.subhead}>
          <div>
            <span>Orientation</span>
            <h3 id="audit-brief-title">Review context</h3>
          </div>
          <span>
            {auditBrief
              ? `${auditBrief.productJob} · ${auditBrief.confidence} confidence`
              : "Not recorded"}
          </span>
        </summary>
        {auditBrief ? (
          <div className={styles.briefSummary}>
            <p>{auditBrief.visibleProposition}</p>
            <dl>
              <div>
                <dt>Product</dt>
                <dd>{auditBrief.productCategory}</dd>
              </div>
              <div>
                <dt>Actor</dt>
                <dd>{auditBrief.audience}</dd>
              </div>
              <div>
                <dt>Job</dt>
                <dd>{auditBrief.productJob}</dd>
              </div>
              <div>
                <dt>Primary action</dt>
                <dd>{auditBrief.primaryAction}</dd>
              </div>
              <div>
                <dt>Audit goal</dt>
                <dd>{auditBrief.auditGoal || "General product-design review"}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd title={auditBrief.evidenceRefs.join(" · ")}>
                  {auditBrief.evidenceRefs.join(" · ")}
                </dd>
              </div>
            </dl>
            {auditBrief.unresolvedQuestions.length > 0 ? (
              <p className={styles.unresolvedBrief}>
                Still unresolved · {auditBrief.unresolvedQuestions.join(" · ")}
              </p>
            ) : null}
          </div>
        ) : (
          <p className={styles.emptyCopy}>
            Orient the visible product before judging it. Captured page copy is evidence, not
            instruction.
          </p>
        )}
        <details className={styles.briefEditor}>
          <summary>{auditBrief ? "Update brief" : "Record brief"}</summary>
          <form key={auditBrief?.updatedAt ?? "new-brief"} onSubmit={submit}>
            <p>Supplied audit goal · {auditGoal || "General product-design review"}</p>
            <div className={styles.briefFields}>
              <label>
                <span>Product type</span>
                <input
                  name="product-category"
                  required
                  maxLength={80}
                  defaultValue={auditBrief?.productCategory}
                  placeholder="e.g. Operations dashboard"
                />
              </label>
              <label>
                <span>Likely actor</span>
                <input
                  name="audience"
                  required
                  maxLength={100}
                  defaultValue={auditBrief?.audience}
                  placeholder="Who uses this visible surface?"
                />
              </label>
              <label>
                <span>Primary product job</span>
                <input
                  name="product-job"
                  required
                  maxLength={140}
                  defaultValue={auditBrief?.productJob}
                  placeholder="What outcome is this screen helping them reach?"
                />
              </label>
              <label>
                <span>Visible proposition</span>
                <input
                  name="visible-proposition"
                  required
                  maxLength={180}
                  defaultValue={auditBrief?.visibleProposition}
                  placeholder="What value does the rendered evidence support?"
                />
              </label>
              <label>
                <span>Primary action</span>
                <input
                  name="primary-action"
                  required
                  maxLength={100}
                  defaultValue={auditBrief?.primaryAction}
                  placeholder="Most prominent visible next step"
                />
              </label>
              <label>
                <span>Evidence confidence</span>
                <select name="brief-confidence" defaultValue={auditBrief?.confidence ?? "medium"}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
            </div>
            <label>
              <span>Unresolved questions · one per line</span>
              <textarea
                name="unresolved-questions"
                rows={2}
                maxLength={960}
                defaultValue={auditBrief?.unresolvedQuestions.join("\n")}
                placeholder="Which routes, states, or behaviors would change this orientation?"
              />
            </label>
            <button type="submit" disabled={!baseline || demoState !== "baseline"}>
              {auditBrief ? "Update provisional brief" : "Record provisional brief"}
            </button>
          </form>
        </details>
      </details>
    </section>
  );
}

function ReviewResultsPanel({
  reviewResults,
  auditBrief,
  baseline,
  checkpoint,
  demoState,
  onRecordReviewResult,
}: WorkbenchViewProps) {
  const scopeId = checkpoint?.scopeId ?? baseline?.scopeKey ?? "";
  const evidenceRef = checkpoint?.id ?? "included-live-target";
  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void onRecordReviewResult({
      kind: formText(data, "result-kind") as ReviewResultInput["kind"],
      category: formText(data, "result-category") as ReviewResultInput["category"],
      observation: formText(data, "result-observation"),
      whyItSupportsJob: formText(data, "result-rationale"),
      confidence: formText(data, "result-confidence") as ReviewResultInput["confidence"],
      scopeId,
      evidenceRef,
    }).then((recorded) => {
      if (recorded) form.reset();
    });
  };

  return (
    <section className={styles.reviewResults} aria-labelledby="review-results-title">
      <div className={styles.subhead}>
        <h3 id="review-results-title">What already works</h3>
        <span>{reviewResults.length} review results</span>
      </div>
      <div className={styles.resultList}>
        {reviewResults.map((result) => (
          <article key={result.id} data-kind={result.kind}>
            <span>
              {result.kind === "strength" ? "Strength" : "No material issue"} · {result.category}
            </span>
            <b>{result.observation}</b>
            <p>{result.whyItSupportsJob}</p>
            <small>
              {result.confidence} confidence · <code>{result.scopeId}</code>
            </small>
          </article>
        ))}
        {reviewResults.length === 0 ? (
          <p className={styles.emptyCopy}>
            Preserve what works. A no-issue result is valid only for a category actually inspected.
          </p>
        ) : null}
      </div>
      <details className={styles.reviewResultEditor}>
        <summary>Add a strength or no-issue result</summary>
        <form onSubmit={submit}>
          <div className={styles.briefFields}>
            <label>
              <span>Result</span>
              <select name="result-kind" defaultValue="strength">
                <option value="strength">Strength worth preserving</option>
                <option value="no_material_issue">No material issue observed</option>
              </select>
            </label>
            <label>
              <span>Category inspected</span>
              <select name="result-category" defaultValue="ui">
                <option value="ui">UI</option>
                <option value="ux">UX</option>
                <option value="interaction">Interaction</option>
              </select>
            </label>
            <label>
              <span>Confidence</span>
              <select name="result-confidence" defaultValue="medium">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
          </div>
          <label>
            <span>Specific observation</span>
            <textarea name="result-observation" required maxLength={240} rows={2} />
          </label>
          <label>
            <span>Why it supports the product job</span>
            <textarea name="result-rationale" required maxLength={240} rows={2} />
          </label>
          <button
            type="submit"
            disabled={!baseline || !auditBrief || !scopeId || demoState !== "baseline"}
          >
            Record review result
          </button>
        </form>
      </details>
    </section>
  );
}

function FindingRows({
  findings,
  selected,
  startIndex,
  onFocusFinding,
}: {
  findings: VisibleFinding[];
  selected: VisibleFinding | null;
  startIndex: number;
  onFocusFinding: (findingId: string) => void;
}) {
  return (
    <>
      {findings.map((finding, index) => {
        const defensible = hasDefensibleThreshold(finding.measurement);
        const receipt = Boolean(finding.measurement) && !defensible;
        return (
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
            <span className={styles.findingNumber}>{startIndex + index + 1}</span>
            <span className={styles.findingCopy}>
              <span className={styles.findingMeta}>
                <b data-truth={receipt ? "receipt" : finding.truth}>
                  {receipt ? "measurement" : finding.truth}
                </b>
                {finding.category ? (
                  <>
                    <i>·</i>
                    <span>{finding.category}</span>
                  </>
                ) : null}
                {!receipt && finding.severity ? (
                  <>
                    <i>·</i>
                    <span>{finding.severity}</span>
                  </>
                ) : null}
                {finding.confidence ? (
                  <>
                    <i>·</i>
                    <span>{finding.confidence} confidence</span>
                  </>
                ) : null}
                {finding.verification !== "not_run" ? (
                  <em data-status={finding.verification}>
                    {verificationLabel(finding.verification)}
                  </em>
                ) : null}
              </span>
              <strong>{finding.title}</strong>
              <small>
                {defensible && finding.measurement
                  ? `${finding.measurement.value} · needs ${finding.measurement.threshold}`
                  : finding.measurement
                    ? finding.observation
                    : "Evidence-linked product judgment"}
                {finding.instanceCount && finding.instanceCount > 1
                  ? ` · ${finding.instanceCount} instances · worst shown`
                  : ""}
              </small>
            </span>
            <Icon name="chevron" />
          </button>
        );
      })}
    </>
  );
}

function SignalRows({
  findings,
  selected,
  onFocusFinding,
}: {
  findings: VisibleFinding[];
  selected: VisibleFinding | null;
  onFocusFinding: (findingId: string) => void;
}) {
  return (
    <>
      {findings.map((finding) => (
        <button
          id={`finding-${finding.id}`}
          className={styles.signalRow}
          type="button"
          key={finding.id}
          data-selected={selected?.id === finding.id}
          aria-pressed={selected?.id === finding.id}
          aria-controls="selected-finding-inspector"
          onClick={() => onFocusFinding(finding.id)}
        >
          <strong>{finding.title}</strong>
          <small>{finding.observation}</small>
        </button>
      ))}
    </>
  );
}

function DesignEmptyState({ includedDemoUrl }: { includedDemoUrl: string }) {
  const { targetUrl, goal } = useAuditIntent();
  function openChatGpt() {
    try {
      const launch = createAuditLaunch(targetUrl.trim() || includedDemoUrl, goal);
      const workspaceUrl = buildWorkspaceUrl(window.location.origin, launch);
      window.open(
        buildChatGptComposerUrl(buildChatGptHandoffPrompt(launch, workspaceUrl, includedDemoUrl)),
        "_blank",
        "noopener,noreferrer",
      );
    } catch {
      return;
    }
  }
  return (
    <div className={styles.reviewPrompt}>
      <p>
        <strong>Ready for design review.</strong> Ask ChatGPT to assess the product, then choose
        what to change.
      </p>
      <button className={styles.chatGptLaneAction} type="button" onClick={openChatGpt}>
        <Icon name="agent" /> Review in ChatGPT Work
      </button>
    </div>
  );
}

function FindingList({
  evidenceBoard,
  visibleFindings,
  selected,
  baseline,
  includedDemoUrl,
  mode,
  onInspectAgentSurface,
  onFocusFinding,
}: WorkbenchViewProps) {
  const designSignalFindings = visibleFindings.filter(({ rule }) => rule === "design-signal");
  const designFindings = visibleFindings.filter(({ truth }) => truth === "judged");
  const agentFindings = visibleFindings.filter(({ rule }) => rule === "agent-surface");
  const technicalFindings = visibleFindings.filter(
    ({ truth, rule }) =>
      truth === "measured" && rule !== "agent-surface" && rule !== "design-signal",
  );
  const secondaryCount = designSignalFindings.length + agentFindings.length;
  return (
    <section className={styles.findingList} aria-label={evidenceBoard.listLabel}>
      {!baseline ? (
        <div className={styles.loadingRows} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {baseline ? (
        <>
          {designFindings.length > 0 ? (
            <div className={styles.findingLane} data-lane="design">
              <div className={styles.laneHead}>
                <h3>Design findings</h3>
                <span>{designFindings.length}</span>
              </div>
              <FindingRows
                findings={designFindings}
                selected={selected}
                startIndex={0}
                onFocusFinding={onFocusFinding}
              />
            </div>
          ) : (
            <DesignEmptyState includedDemoUrl={includedDemoUrl} />
          )}
          <div className={styles.findingLane} data-lane="measured">
            <div className={styles.laneHead}>
              <h3>Measured findings</h3>
              <span>{technicalFindings.length}</span>
            </div>
            <FindingRows
              findings={technicalFindings}
              selected={selected}
              startIndex={designFindings.length}
              onFocusFinding={onFocusFinding}
            />
            {technicalFindings.length === 0 ? (
              <p className={styles.emptyCopy}>No measured issue was reproduced in this view.</p>
            ) : null}
          </div>
          <details className={styles.secondaryReview}>
            <summary className={styles.laneHead}>
              <h3>Signals and Site Tools</h3>
              <span>
                {secondaryCount} {secondaryCount === 1 ? "item" : "items"}
              </span>
            </summary>
            <div className={styles.secondaryTools}>
              {mode === "sample" ? (
                <button type="button" className={styles.laneAction} onClick={onInspectAgentSurface}>
                  <Icon name="agent" /> Inspect Site Tools
                </button>
              ) : null}
            </div>
            <FindingRows
              findings={agentFindings}
              selected={selected}
              startIndex={designFindings.length + technicalFindings.length}
              onFocusFinding={onFocusFinding}
            />
            <SignalRows
              findings={designSignalFindings}
              selected={selected}
              onFocusFinding={onFocusFinding}
            />
          </details>
        </>
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
  auditBrief,
  activePreviewFindingId,
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
  const authority = evaluatePreviewAuthority({
    findingId: selected.id,
    decision: selected.decision,
    reason: selected.decisionReason,
    previewActive: demoState === "improved",
    previewFindingId: activePreviewFindingId,
  });
  const previewDisabled =
    auditing ||
    demoState === "improved" ||
    !authority.canPreview ||
    selected.rule === "agent-surface" ||
    selected.rule === "design-signal" ||
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
            <span>Category</span>
            <select
              value={judgmentDraft.category}
              onChange={(event) =>
                onChangeJudgmentDraft((draft) => ({
                  ...draft,
                  category: event.target.value as JudgedFindingInput["category"],
                }))
              }
            >
              <option value="ui">UI</option>
              <option value="ux">UX</option>
              <option value="interaction">Interaction</option>
            </select>
          </label>
          <label>
            <span>Product job (optional)</span>
            <input
              maxLength={80}
              value={judgmentDraft.productJob ?? ""}
              onChange={(event) =>
                onChangeJudgmentDraft((draft) => ({
                  ...draft,
                  productJob: event.target.value,
                }))
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
          <label>
            <span>Evidence confidence</span>
            <select
              value={judgmentDraft.confidence}
              onChange={(event) =>
                onChangeJudgmentDraft((draft) => ({
                  ...draft,
                  confidence: event.target.value as JudgedFindingInput["confidence"],
                }))
              }
            >
              <option value="high">High · directly reproducible</option>
              <option value="medium">Medium · visible once</option>
              <option value="low">Low · hypothesis to validate</option>
            </select>
          </label>
          <button type="submit" disabled={demoState !== "baseline" || !auditBrief}>
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
          title={previewDisabled ? authority.previewMessage : undefined}
          onClick={() => onPreviewFix(mode === "remote" ? cssDraft : undefined)}
        >
          <Icon name="spark" /> {previewLabel}
        </button>
        <button
          type="button"
          className={styles.verifyButton}
          disabled={auditing || !authority.canVerify}
          title={authority.verifyMessage}
          onClick={() => onVerifyRecapture(selected.id)}
        >
          <Icon name="refresh" /> Verify recapture
        </button>
      </div>
    </>
  );
}

function FindingInspector(props: WorkbenchViewProps) {
  const { selected, inspectorRef, coverage, visibleFindings } = props;
  if (!selected) return null;
  const surface = findFindingSurface(coverage.surfaces, selected);
  const findingNumber = visibleFindings.findIndex((finding) => finding.id === selected.id) + 1;
  const descriptive = selected.rule === "design-signal";
  const defensible = hasDefensibleThreshold(selected.measurement);

  return (
    <article
      className={styles.inspector}
      id="selected-finding-inspector"
      ref={inspectorRef}
      tabIndex={-1}
      aria-labelledby="selected-title"
    >
      <div className={styles.inspectorTop}>
        {descriptive ? null : <span className={styles.findingNumber}>{findingNumber}</span>}
        <span className={styles.truthBadge} data-truth={descriptive ? "receipt" : selected.truth}>
          {descriptive ? "measurement" : selected.truth}
        </span>
        {selected.category ? (
          <span className={styles.truthBadge} data-truth="judged">
            {selected.category}
          </span>
        ) : null}
        {selected.confidence ? (
          <span className={styles.confidenceBadge}>{selected.confidence} confidence</span>
        ) : null}
        <code>{selected.id}</code>
        <span className={styles.decisionBadge} data-decision={selected.decision}>
          {DECISION_OPTIONS[selected.decision].label}
        </span>
      </div>
      <h3 id="selected-title">{selected.title}</h3>
      <p className={styles.observation}>{selected.observation}</p>
      {selected.productJob ? (
        <p className={styles.evidenceRef}>Product job · {selected.productJob}</p>
      ) : null}
      {selected.evidence ? (
        <p className={styles.evidenceRef}>
          Evidence · {selected.evidence.kind} · <code>{selected.evidence.ref}</code>
        </p>
      ) : null}

      <dl className={styles.measurement} aria-label="Finding evidence scope">
        {selected.measurement ? (
          <>
            <div>
              <dt>Observed</dt>
              <dd>{selected.measurement.value}</dd>
            </div>
            <div>
              <dt>Threshold</dt>
              <dd>
                {defensible
                  ? selected.measurement.threshold
                  : "No universal quality threshold exists."}
              </dd>
            </div>
          </>
        ) : null}
        {selected.instanceCount && selected.instanceCount > 1 ? (
          <div>
            <dt>Instances</dt>
            <dd>{selected.instanceCount} · worst shown</dd>
          </div>
        ) : null}
        {selected.aboveTheFold != null ? (
          <div>
            <dt>Fold</dt>
            <dd>{selected.aboveTheFold ? "Above the fold" : "Below the fold"}</dd>
          </div>
        ) : null}
        <div>
          <dt>Route</dt>
          <dd title={surface?.finalUrl}>{surface?.route ?? "Unknown route"}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{surface?.state ?? "Unknown state"}</dd>
        </div>
        <div>
          <dt>Viewport</dt>
          <dd>{selected.viewport}</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>
            <code>{selected.scopeKey ?? surface?.scopeId ?? "Unknown scope"}</code>
          </dd>
        </div>
        <div>
          <dt>Verification</dt>
          <dd>{verificationLabel(selected.verification)}</dd>
        </div>
      </dl>

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

      <CheckpointEvidence {...props} />

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

      <FindingControls {...props} />
    </article>
  );
}

function CoveragePanel({
  coverage,
  activeGaps,
  gapDraft,
  mode,
  checkpoint,
  demoState,
  auditing,
  uncapturedNav,
  onChangeGapDraft,
  onSubmitCoverageGap,
  onCaptureVisibleNav,
  onCaptureBelowFold,
  onOpenJourneyCheckpoint,
}: WorkbenchViewProps) {
  return (
    <section className={styles.gaps} aria-labelledby="coverage-title">
      <details>
        <summary className={styles.subhead}>
          <h3 id="coverage-title">What was reviewed</h3>
          <span>
            {coverage.surfaces.length} surfaces · {coverage.openGapCount} open gaps
          </span>
        </summary>
        <div className={styles.coverageMatrix} role="list" aria-label="Audit coverage matrix">
          {coverage.surfaces.map((surface) => {
            const summary = (
              <>
                <span>{surface.surfaceType}</span>
                <b title={surface.finalUrl}>{surface.route}</b>
                <small>
                  {surface.findingCount} facts · {shortTime(surface.capturedAt)}
                </small>
              </>
            );
            return (
              <div key={surface.checkpointId} role="listitem">
                {mode === "remote" ? (
                  <button
                    type="button"
                    className={styles.surfaceJump}
                    data-current={surface.checkpointId === checkpoint?.id}
                    aria-pressed={surface.checkpointId === checkpoint?.id}
                    title={surface.finalUrl}
                    onClick={() =>
                      onOpenJourneyCheckpoint({
                        checkpointId: surface.checkpointId,
                        scopeId: surface.scopeId,
                        label: surface.label,
                        displayUrl: surface.finalUrl,
                        capturedAt: surface.capturedAt,
                        findingCount: surface.findingCount,
                        viewport: surface.viewport,
                      })
                    }
                  >
                    {summary}
                  </button>
                ) : (
                  <div className={styles.surfaceJump} data-static="true" title={surface.finalUrl}>
                    {summary}
                  </div>
                )}
                <dl>
                  <div>
                    <dt>Viewport</dt>
                    <dd>{surface.viewport}</dd>
                  </div>
                  <div>
                    <dt>State</dt>
                    <dd>{surface.state}</dd>
                  </div>
                  <div>
                    <dt>Extent</dt>
                    <dd>{surface.captureExtent}</dd>
                  </div>
                  <div>
                    <dt>Evidence</dt>
                    <dd>{surface.evidenceTypes.join(" · ")}</dd>
                  </div>
                  <div>
                    <dt>Motion</dt>
                    <dd>{surface.motion.replace("_", " ")}</dd>
                  </div>
                  <div>
                    <dt>Interaction</dt>
                    <dd>{surface.interaction.replace("_", " ")}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{surface.status.replace("_", " ")}</dd>
                  </div>
                </dl>
                <small>
                  {surface.reason ? `${surface.reason} · ` : ""}
                  <code>{surface.checkpointId}</code>
                </small>
              </div>
            );
          })}
          {coverage.surfaces.length === 0 ? (
            <p className={styles.emptyCopy}>
              Capture or measure a surface before claiming coverage.
            </p>
          ) : null}
        </div>
        {mode === "remote" && checkpoint && demoState === "baseline" ? (
          <div className={styles.extendRow}>
            {uncapturedNav.length > 0 ? (
              <button type="button" disabled={auditing} onClick={onCaptureVisibleNav}>
                <Icon name="spark" /> Add visible nav
              </button>
            ) : null}
            <button type="button" disabled={auditing} onClick={onCaptureBelowFold}>
              <Icon name="focus" /> Add below-fold
            </button>
          </div>
        ) : null}
        <div className={styles.subhead}>
          <h3 id="gaps-title">Not seen</h3>
          <span>{activeGaps.length} coverage gaps</span>
        </div>
        {activeGaps.map((gap) => (
          <div key={gap.id}>
            <b>
              {gap.label} ·{" "}
              {gap.targets
                .map(
                  ({ route, scopeId, viewport }) =>
                    `${route ?? scopeId ?? "audit scope"} · ${viewport}`,
                )
                .join(" + ")}
            </b>
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
      </details>
    </section>
  );
}

function ActivityReceiptEntry({ entry }: { entry: Activity }) {
  return (
    <li>
      <span data-actor={entry.actor} role="img" aria-label={activityActorLabel(entry.actor)}>
        {entry.actor === "agent" ? <Icon name="agent" /> : entry.actor.slice(0, 1).toUpperCase()}
      </span>
      <div>
        <b>{activityTitle(entry)}</b>
        <p>{entry.detail}</p>
      </div>
      <time dateTime={entry.at}>{shortTime(entry.at)}</time>
    </li>
  );
}

function ActivityReceipts({ activity, activityLimit }: WorkbenchViewProps) {
  const latest = activity[0];
  const older = activity.slice(1, 20);
  return (
    <section className={styles.receipts} aria-labelledby="receipts-title">
      <div className={styles.subhead}>
        <h3 id="receipts-title">Action receipts</h3>
        <span>
          Last {Math.min(activity.length, 20)} · retains {activityLimit}
        </span>
      </div>
      <ol>
        {latest ? (
          <ActivityReceiptEntry entry={latest} />
        ) : (
          <li className={styles.emptyReceipt}>The first capture will appear here.</li>
        )}
      </ol>
      {older.length > 0 ? (
        <details>
          <summary>Earlier receipts</summary>
          <ol>
            {older.map((entry) => (
              <ActivityReceiptEntry key={entry.id} entry={entry} />
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

function EvidencePane(
  props: WorkbenchViewProps & { hostToolCount: number | null; onClose: () => void },
) {
  const { evidenceBoard, measuredCount, judgedCount, onClose } = props;
  return (
    <aside className={styles.evidencePane} id="evidence-pane" aria-label="Evidence board">
      <div className={styles.evidenceHead}>
        <div>
          <h2 id="evidence-title">Findings</h2>
          <p>
            {measuredCount} measured ·{" "}
            {judgedCount > 0 ? `${judgedCount} judged` : "design review ready"}
          </p>
          <span className={styles.srOnly} aria-live="polite">
            {evidenceBoard.summary}
          </span>
        </div>
        <button
          className={styles.closePane}
          type="button"
          aria-label="Close findings panel"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <FindingList {...props} />
      <FindingInspector {...props} />
      <ReviewResultsPanel {...props} />
      <CoveragePanel {...props} />
      <AuditBriefPanel {...props} />
      <ActivityReceipts {...props} />
      <AgentAuthority {...props} />
    </aside>
  );
}

const SIDEBAR_MIN_WIDTH = 288;
const SIDEBAR_MAX_WIDTH = 560;
const SIDEBAR_RESIZE_STEP = 32;

function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

export function WorkbenchView(props: WorkbenchViewProps) {
  const [toolRegistration, setToolRegistration] = useState<ToolRegistrationState>({
    mode: props.mode,
    status: "checking",
  });
  const [hostToolCount, setHostToolCount] = useState<number | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [captureFormOpen, setCaptureFormOpen] = useState(false);
  const dragRef = useRef<{ x: number; width: number } | null>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null);
  const toolStatus = toolRegistration.mode === props.mode ? toolRegistration.status : "checking";
  const { sidebarOpen, onSidebarOpenChange } = props;

  useEffect(() => {
    if (toolStatus !== "ready") {
      setHostToolCount(null);
      return;
    }
    let cancelled = false;
    void confirmedWorkbenchToolCount().then((count) => {
      if (!cancelled && count !== null) setHostToolCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [toolStatus]);

  useEffect(() => {
    if (props.checkpoint) setCaptureFormOpen(false);
  }, [props.checkpoint?.id]);

  const showCaptureForm = captureFormOpen || (props.mode === "remote" && !props.checkpoint);

  const endHandleDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const closeSidebar = () => {
    onSidebarOpenChange(false);
    window.requestAnimationFrame(() => sidebarToggleRef.current?.focus());
  };

  return (
    <main
      className={styles.app}
      id="workbench"
      data-mode={props.mode}
      aria-label="Sundae audit workbench"
    >
      <AuditTopbar
        {...props}
        toolStatus={toolStatus}
        hostToolCount={hostToolCount}
        onToolStatusChange={setToolRegistration}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => onSidebarOpenChange(!sidebarOpen)}
        sidebarToggleRef={sidebarToggleRef}
      />
      <div
        className={styles.workbench}
        data-sidebar={sidebarOpen ? "open" : "closed"}
        style={{ "--evidence-width": `${sidebarWidth}px` } as CSSProperties}
      >
        <ProductPane
          {...props}
          captureFormOpen={showCaptureForm}
          onToggleCaptureForm={() => setCaptureFormOpen((open) => !open)}
        />
        {sidebarOpen ? (
          <div
            className={styles.sidebarHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the findings sidebar"
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuenow={sidebarWidth}
            aria-valuetext={`${sidebarWidth} pixels wide`}
            tabIndex={0}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { x: event.clientX, width: sidebarWidth };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || (event.buttons & 1) === 0) return;
              setSidebarWidth(clampSidebarWidth(drag.width + (drag.x - event.clientX)));
            }}
            onPointerUp={endHandleDrag}
            onPointerCancel={endHandleDrag}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setSidebarWidth((width) => clampSidebarWidth(width + SIDEBAR_RESIZE_STEP));
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                setSidebarWidth((width) => clampSidebarWidth(width - SIDEBAR_RESIZE_STEP));
              } else if (event.key === "Home") {
                event.preventDefault();
                setSidebarWidth(SIDEBAR_MIN_WIDTH);
              } else if (event.key === "End") {
                event.preventDefault();
                setSidebarWidth(SIDEBAR_MAX_WIDTH);
              }
            }}
          />
        ) : null}
        <EvidencePane {...props} hostToolCount={hostToolCount} onClose={closeSidebar} />
      </div>
    </main>
  );
}
