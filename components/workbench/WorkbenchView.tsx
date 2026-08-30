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
import type {
  AuditBrief,
  AuditBriefInput,
  AuditSnapshot,
  CoverageGap,
  DemoState,
  ReviewResult,
  ReviewResultInput,
  Viewport,
} from "@/lib/audit/types";
import type { RemoteCheckpoint } from "@/lib/capture/types";
import type { CoverageSummary, CoverageTrailEntry } from "@/lib/workbench/coverage";
import { DECISION_OPTIONS, DECISION_VALUES, type Decision } from "@/lib/workbench/decisions";
import {
  describeAgentAuthority,
  type EvidenceBoardDescription,
  verificationLabel,
} from "@/lib/workbench/evidence";
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

export type JourneyEntry = CoverageTrailEntry;

type GapDraft = { label: string; detail: string };
type ToolRegistrationState = { mode: TargetMode; status: WebMcpStatus };

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

function WebMcpIndicator({
  commands,
  mode,
  status,
  onStatusChange,
}: {
  commands: WorkbenchCommands;
  mode: TargetMode;
  status: WebMcpStatus;
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

function AgentAuthority({
  mode,
  checkpoint,
  current,
  urlDraft,
  draftApproved,
  toolStatus,
}: WorkbenchViewProps & { toolStatus: WebMcpStatus }) {
  const expectedCount = WEBMCP_TOOL_COUNTS[mode];
  const authority = describeAgentAuthority(mode, checkpoint, current?.scopeKey);
  const target = mode === "remote" ? checkpoint?.target.displayUrl || urlDraft : "/demo";
  const approval =
    mode === "sample"
      ? "Included target; no public capture grant"
      : draftApproved
        ? "Exact displayed URL allowed for this session"
        : checkpoint
          ? "Captured target allowed for bounded follow-up"
          : "No agent capture allowed yet";

  return (
    <section className={styles.authorityBar} aria-label="Agent authority">
      <div>
        <span>Agent authority</span>
        <strong>{authority.label}</strong>
      </div>
      <dl>
        <div>
          <dt>Target</dt>
          <dd title={target}>{target}</dd>
        </div>
        <div>
          <dt>Tools</dt>
          <dd>
            {toolStatus === "ready"
              ? `${expectedCount}/${expectedCount} registered`
              : `${webMcpLabels[toolStatus]} · ${expectedCount} expected`}
          </dd>
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
    </section>
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
  coverage: CoverageSummary;
  evidenceBoard: EvidenceBoardDescription;
  activeGaps: CoverageGap[];
  activity: Activity[];
  activityLimit: number;
  auditing: boolean;
  error: string | null;
  journey: JourneyEntry[];
  uncapturedNav: Array<{ url: string; label: string }>;
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
  mode,
  checkpoint,
  onAudit,
  toolStatus,
  onToolStatusChange,
}: WorkbenchViewProps & {
  toolStatus: WebMcpStatus;
  onToolStatusChange: Dispatch<SetStateAction<ToolRegistrationState>>;
}) {
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
        <WebMcpIndicator
          commands={commands}
          mode={mode}
          status={toolStatus}
          onStatusChange={onToolStatusChange}
        />
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
  onCaptureVisibleNav,
  uncapturedNav,
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
      {mode === "remote" && checkpoint && demoState === "baseline" && uncapturedNav.length > 0 ? (
        <button type="button" disabled={auditing} onClick={onCaptureVisibleNav}>
          <Icon name="spark" /> Add visible nav
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
          {`${auditGoal ? `Goal · ${auditGoal} · ` : ""}Choose one: allow the agent for this exact URL, or capture it yourself now. Full page when it fits; no passwords or silent crawling.`}
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
            <Icon name="agent" /> {draftApproved ? "Agent allowed" : "Allow agent to capture"}
          </button>
        ) : null}
        <button type="submit" disabled={auditing || !hasUrl}>
          <Icon name="focus" /> Capture myself
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
      <div className={styles.subhead}>
        <div>
          <span>Orientation</span>
          <h3 id="audit-brief-title">Provisional product brief</h3>
        </div>
        <span>{auditBrief ? `${auditBrief.confidence} confidence` : "Not recorded"}</span>
      </div>
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
      <details className={styles.briefEditor} open={!auditBrief}>
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
        <h3 id="review-results-title">Strengths and clear categories</h3>
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
      {findings.map((finding, index) => (
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
              <b data-truth={finding.truth}>{finding.truth}</b>
              {finding.category ? (
                <>
                  <i>·</i>
                  <span>{finding.category}</span>
                </>
              ) : null}
              <i>·</i>
              <span>{finding.severity}</span>
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
              {finding.measurement
                ? `${finding.measurement.value} · needs ${finding.measurement.threshold}`
                : "Evidence-linked product judgment"}
            </small>
          </span>
          <Icon name="chevron" />
        </button>
      ))}
    </>
  );
}

function FindingList({
  evidenceBoard,
  visibleFindings,
  selected,
  baseline,
  onFocusFinding,
}: WorkbenchViewProps) {
  const productFindings = visibleFindings.filter(({ truth }) => truth === "judged");
  const supportingFacts = visibleFindings.filter(({ truth }) => truth === "measured");
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
        <div className={styles.findingLane}>
          <div className={styles.laneHead}>
            <h3>Product findings</h3>
            <span>{productFindings.length} supported judgments</span>
          </div>
          <FindingRows
            findings={productFindings}
            selected={selected}
            startIndex={0}
            onFocusFinding={onFocusFinding}
          />
          {productFindings.length === 0 ? (
            <p className={styles.emptyCopy}>
              No supported product fault recorded yet. A strong sampled surface may legitimately
              remain empty.
            </p>
          ) : null}
        </div>
      ) : null}
      {baseline ? (
        <div className={styles.findingLane} data-lane="supporting">
          <div className={styles.laneHead}>
            <h3>Supporting facts</h3>
            <span>{supportingFacts.length} deterministic observations</span>
          </div>
          <FindingRows
            findings={supportingFacts}
            selected={selected}
            startIndex={productFindings.length}
            onFocusFinding={onFocusFinding}
          />
          {supportingFacts.length === 0 ? (
            <p className={styles.emptyCopy}>No deterministic fault was reproduced in this scope.</p>
          ) : null}
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
  auditBrief,
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
  coverage,
  activeGaps,
  gapDraft,
  onChangeGapDraft,
  onSubmitCoverageGap,
}: WorkbenchViewProps) {
  return (
    <section className={styles.gaps} aria-labelledby="coverage-title">
      <div className={styles.subhead}>
        <h3 id="coverage-title">Observed scope</h3>
        <span>
          {coverage.surfaces.length} surfaces · {coverage.openGapCount} open gaps
        </span>
      </div>
      <div className={styles.coverageMatrix} role="list" aria-label="Audit coverage matrix">
        {coverage.surfaces.map((surface) => (
          <article key={surface.checkpointId} role="listitem">
            <div>
              <span>{surface.surfaceType}</span>
              <b title={surface.finalUrl}>{surface.route}</b>
            </div>
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
                <dt>Status</dt>
                <dd>{surface.status.replace("_", " ")}</dd>
              </div>
            </dl>
            <small>
              {surface.reason ? `${surface.reason} · ` : ""}
              {shortTime(surface.capturedAt)} · <code>{surface.checkpointId}</code>
            </small>
          </article>
        ))}
        {coverage.surfaces.length === 0 ? (
          <p className={styles.emptyCopy}>Capture or measure a surface before claiming coverage.</p>
        ) : null}
      </div>
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
  const { evidenceBoard, measuredCount, judgedCount, reviewResults, activeGaps } = props;
  const strengthCount = reviewResults.filter(({ kind }) => kind === "strength").length;
  const noIssueCount = reviewResults.filter(({ kind }) => kind === "no_material_issue").length;
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
          <span>{strengthCount} strengths</span>
          <span>{noIssueCount} clear</span>
          <span>{activeGaps.length} gaps</span>
        </div>
      </div>
      <AuditBriefPanel {...props} />
      <CoveragePanel {...props} />
      <ReviewResultsPanel {...props} />
      <FindingList {...props} />
      <FindingInspector {...props} />
      <ActivityReceipts {...props} />
    </section>
  );
}

export function WorkbenchView(props: WorkbenchViewProps) {
  const [toolRegistration, setToolRegistration] = useState<ToolRegistrationState>({
    mode: props.mode,
    status: "checking",
  });
  const toolStatus = toolRegistration.mode === props.mode ? toolRegistration.status : "checking";

  return (
    <section className={styles.app} data-mode={props.mode} aria-label="Sundae audit workbench">
      <AuditTopbar {...props} toolStatus={toolStatus} onToolStatusChange={setToolRegistration} />
      <ScopeBar {...props} />
      <AgentAuthority {...props} toolStatus={toolStatus} />
      {props.mode === "remote" ? <CaptureBar {...props} /> : null}
      <JourneyBar {...props} />
      <div className={styles.workbench} id="workbench">
        <ProductPane {...props} />
        <EvidencePane {...props} />
      </div>
    </section>
  );
}
