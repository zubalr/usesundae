"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuditIntent } from "@/components/AuditIntent";
import { captureBrowserFacts } from "@/lib/audit/dom";
import { deriveFindings } from "@/lib/audit/derive-findings";
import {
  createJudgedFinding,
  deriveCheckpointFindings,
  normalizeJudgedFindingInput,
  snapshotFromCheckpoint,
  type JudgedFindingInput,
} from "@/lib/audit/remote";
import {
  compareFindingsForReview,
  createAuditBrief,
  createReviewResult,
  validateReviewResultScope,
  withoutConflictingNoIssue,
} from "@/lib/audit/review";
import { auditWebMcpTools, normalizeRuntimeToolContract } from "@/lib/audit/tools";
import type {
  AuditBrief,
  AuditBriefInput,
  AuditSnapshot,
  CoverageGap,
  DemoState,
  Finding,
  ReviewResult,
  ReviewResultInput,
  Viewport,
} from "@/lib/audit/types";
import type { RemoteCheckpoint } from "@/lib/capture/types";
import {
  capturedVisibleNavLabels,
  reconcileVisibleNavGap,
  type VisibleNavRoute,
  uncapturedVisibleNav,
  visibleNavGap,
} from "@/lib/capture/visible-nav";
import { DEMO_TOOL_CONTRACTS } from "@/lib/demo/tools";
import { resolveInitialTargetMode, resolvePublicDemoUrl } from "@/lib/launch";
import { boundedText } from "@/lib/text";
import {
  assertApprovedForActor,
  canonicalizeApprovedUrl,
  seedApprovedUrl,
  shouldAutoStartPublicCapture,
} from "@/lib/workbench/approval";
import {
  acceptFollowThroughKind,
  acceptFollowThroughReceipt,
  runAcceptFollowThrough,
} from "@/lib/workbench/accept-follow-through";
import type { CaptureProgressStage } from "@/lib/workbench/capture-progress";
import { deriveCoverageSummary, inferSurfaceType } from "@/lib/workbench/coverage";
import {
  assertSameJourneyOrigin,
  clearVisibleNavGaps,
  mergeBelowFoldSnapshot,
  mergeJourneySnapshots,
} from "@/lib/workbench/journey";
import { LatestOperation } from "@/lib/workbench/latest-operation";
import type { Decision } from "@/lib/workbench/decisions";
import {
  buildAgentBoardContext,
  buildVerificationReceipts,
  describeEvidenceBoard,
  invalidateVerificationForFindings,
  judgmentRecordOutcome,
  mergeAuditWithFirstBoardPage,
} from "@/lib/workbench/evidence";
import { evaluatePreviewAuthority } from "@/lib/workbench/preview-authority";
import {
  committedSystemBaselineKey,
  shouldCommitMeasuredSnapshot,
  shouldScheduleSystemAudit,
} from "@/lib/workbench/system-baseline";
import { runReversibleTransition } from "@/lib/workbench/transition";
import {
  countAgentToolCalls,
  type Activity,
  type Actor,
  type CommandResult,
  type VerificationReceipt,
  type VisibleFinding,
  type WorkbenchCommands,
} from "@/lib/workbench/types";
import { type JourneyEntry, type TargetMode, WorkbenchView } from "./workbench/WorkbenchView";

const MAX_ACTIVITY_RECEIPTS = 100;
const MAX_MANUAL_JUDGMENTS = 32;
const MAX_REVIEW_RESULTS = 32;
const MAX_COVERAGE_GAPS = 32;

function browserMsReceipt(checkpoint: RemoteCheckpoint) {
  const ms = checkpoint.browserMsUsed;
  if (typeof ms !== "number") {
    return { suffix: "", fields: {} as { browser_ms_used?: number } };
  }
  return { suffix: ` · ${ms} ms browser`, fields: { browser_ms_used: ms } };
}

function withFirstBoardPage(
  audit: CommandResult,
  board: ReturnType<typeof buildAgentBoardContext> | null,
): CommandResult {
  if (!audit.ok || !board) return audit;
  return (
    mergeAuditWithFirstBoardPage({ ...audit, ok: true, receipt: audit.receipt }, board) ?? audit
  );
}

const SAMPLE_GAPS: CoverageGap[] = [
  {
    id: "gap-invite",
    label: "Invite flow",
    detail: "The team invitation confirmation was not opened.",
  },
  {
    id: "gap-billing",
    label: "Billing settings",
    detail: "An authenticated billing state was not part of this scope.",
  },
  {
    id: "gap-motion-window",
    label: "Motion and transition behavior",
    detail: "No reproducible motion or transition window was captured in this static viewport.",
  },
  {
    id: "gap-flow-states",
    label: "Multi-step flow states",
    detail: "Loading, error, empty, and success states were not opened in this sampled scope.",
  },
];
const EMPTY_JUDGMENT: JudgedFindingInput = {
  title: "",
  observation: "",
  whyItMatters: "",
  recommendation: "",
  severity: "medium",
  confidence: "medium",
  category: "ui",
};

type SnapshotMap = Partial<Record<Viewport, AuditSnapshot>>;
type CheckpointMap = Partial<Record<Viewport, RemoteCheckpoint>>;
type DecisionRecord = {
  decision: Decision;
  reason: string;
  actor: Actor;
  at: string;
};
type AuditWaiter = {
  state: DemoState;
  resolve: (snapshot: AuditSnapshot) => void;
  reject: (error: Error) => void;
};
type CaptureResponse = { ok: true; checkpoint: RemoteCheckpoint } | { ok: false; message?: string };
type CheckpointRecord = {
  checkpoint: RemoteCheckpoint;
  captureUrl: string;
};
type RemoteCheckpointOptions = {
  previewCss?: string;
  fullPage?: boolean;
  waitForSelector?: string;
  signal?: AbortSignal;
};

function inspectedScopeIds(
  baseline: AuditSnapshot,
  checkpoint: RemoteCheckpoint | null,
  journey: JourneyEntry[],
) {
  return new Set(
    [
      baseline.scopeKey,
      checkpoint?.scopeId,
      ...journey.map(({ scopeId }) => scopeId),
      ...baseline.findings.map(({ scopeKey }) => scopeKey),
    ].filter((scopeId): scopeId is string => Boolean(scopeId)),
  );
}

function inspectedEvidenceRefs(
  baseline: AuditSnapshot,
  checkpoint: RemoteCheckpoint | null,
  journey: JourneyEntry[],
) {
  return new Set(
    [
      ...(!checkpoint ? ["included-live-target"] : []),
      checkpoint?.id,
      ...journey.map(({ checkpointId }) => checkpointId),
      ...baseline.findings.map(({ evidence }) => evidence?.ref),
    ].filter((ref): ref is string => Boolean(ref)),
  );
}

function inspectedEvidenceRefsForScope(
  baseline: AuditSnapshot,
  checkpoint: RemoteCheckpoint | null,
  journey: JourneyEntry[],
  scopeId: string,
) {
  const refs = new Set<string>();
  if (!checkpoint && baseline.scopeKey === scopeId) refs.add("included-live-target");
  if (checkpoint?.scopeId === scopeId) refs.add(checkpoint.id);
  for (const entry of journey) {
    if (entry.scopeId === scopeId) refs.add(entry.checkpointId);
  }
  for (const finding of baseline.findings) {
    if ((finding.scopeKey ?? baseline.scopeKey) !== scopeId || !finding.evidence) continue;
    refs.add(finding.evidence.ref);
  }
  return refs;
}

type WorkbenchProps = {
  initialUrl?: string;
  auditGoal?: string;
  includedDemoUrl?: string;
};

function nowIso() {
  return new Date().toISOString();
}

async function requestCheckpoint(
  url: string,
  viewport: Viewport,
  options: RemoteCheckpointOptions = {},
) {
  const gateResponse = await fetch("/api/capture", {
    method: "GET",
    signal: options.signal,
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!gateResponse.ok) {
    throw new Error(
      "Sundae could not authorize this capture. Refresh the workbench and try again.",
    );
  }

  const response = await fetch("/api/capture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      viewport,
      ...(options.previewCss ? { preview_css: options.previewCss } : {}),
      ...(options.fullPage ? { full_page: true } : {}),
      ...(options.waitForSelector ? { wait_for_selector: options.waitForSelector } : {}),
    }),
    signal: options.signal,
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => null)) as CaptureResponse | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(
      payload && !payload.ok && payload.message
        ? payload.message
        : "Sundae could not create a rendered checkpoint for this page.",
    );
  }
  return payload.checkpoint;
}

function resolveWaitForSelector(requested: string | undefined, fallback?: string) {
  if (requested === undefined) return fallback;
  return requested.trim() || undefined;
}

export function Workbench({
  initialUrl = "",
  auditGoal = "",
  includedDemoUrl = resolvePublicDemoUrl(),
}: WorkbenchProps) {
  const initialMode: TargetMode = resolveInitialTargetMode(initialUrl, includedDemoUrl);
  const { goal: liveAuditGoal } = useAuditIntent();
  const currentAuditGoal = liveAuditGoal || auditGoal;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const activitySequence = useRef(0);
  const activityRef = useRef<Activity[]>([]);
  const judgmentSequence = useRef(0);
  const reviewResultSequence = useRef(0);
  const auditWaiters = useRef<AuditWaiter[]>([]);
  const auditTimerRef = useRef<number | null>(null);
  const committedSystemBaselineRef = useRef<string | null>(null);
  const auditEndTimerRef = useRef<number | null>(null);
  const modeRef = useRef<TargetMode>(initialMode);
  const viewportRef = useRef<Viewport>("mobile");
  const demoStateRef = useRef<DemoState>("baseline");
  const baselineRef = useRef<SnapshotMap>({});
  const currentRef = useRef<SnapshotMap>({});
  const baselineCheckpointRef = useRef<CheckpointMap>({});
  const checkpointRef = useRef<RemoteCheckpoint | null>(null);
  const remoteUrlRef = useRef("");
  const fullPageRef = useRef(false);
  const waitForSelectorRef = useRef<string | undefined>(undefined);
  const previewCssRef = useRef<string | undefined>(undefined);
  const previewFindingIdRef = useRef<string | null>(null);
  const decisionsRef = useRef<Record<string, DecisionRecord>>({});
  const verificationRef = useRef<Record<string, VerificationReceipt>>({});
  const selectedRef = useRef<string | null>(null);
  const auditBriefRef = useRef<AuditBrief | null>(null);
  const reviewResultsRef = useRef<ReviewResult[]>([]);
  const commandRef = useRef<WorkbenchCommands | null>(null);
  const journeyRef = useRef<JourneyEntry[]>([]);
  const visibleNavRef = useRef<VisibleNavRoute[]>([]);
  const checkpointRecordsRef = useRef<Map<string, CheckpointRecord>>(new Map());
  const seededUrl = seedApprovedUrl(initialUrl);
  const approvedUrlsRef = useRef<Set<string>>(new Set(seededUrl ? [seededUrl] : []));
  const draftApprovalRef = useRef<string | null>(null);
  const latestOperationRef = useRef(new LatestOperation());
  const auditCountRef = useRef(0);
  const inspectorRef = useRef<HTMLElement>(null);
  const captureAbortRef = useRef<AbortController | null>(null);
  const cssDraftRef = useRef("");
  const didAutoStartRef = useRef(false);

  const [mode, setMode] = useState<TargetMode>(initialMode);
  const [viewport, setViewport] = useState<Viewport>("mobile");
  const [demoState, setDemoState] = useState<DemoState>("baseline");
  const [urlDraft, setUrlDraft] = useState(initialUrl);
  const [waitForSelectorDraft, setWaitForSelectorDraft] = useState("");
  const [draftApproved, setDraftApproved] = useState(Boolean(seededUrl));
  const [cssDraft, setCssDraft] = useState("");
  const [captureProgress, setCaptureProgress] = useState<CaptureProgressStage | null>(
    shouldAutoStartPublicCapture({
      mode: initialMode,
      initialUrl,
      hasCheckpoint: false,
    })
      ? "rendering"
      : null,
  );
  const [checkpoint, setCheckpoint] = useState<RemoteCheckpoint | null>(null);
  const [baselineSnapshots, setBaselineSnapshots] = useState<SnapshotMap>({});
  const [currentSnapshots, setCurrentSnapshots] = useState<SnapshotMap>({});
  const [decisions, setDecisions] = useState<Record<string, DecisionRecord>>({});
  const [verification, setVerification] = useState<Record<string, VerificationReceipt>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [auditing, setAuditing] = useState(
    initialMode === "sample" ||
      shouldAutoStartPublicCapture({
        mode: initialMode,
        initialUrl,
        hasCheckpoint: false,
      }),
  );
  const [error, setError] = useState<string | null>(null);
  const [journey, setJourney] = useState<JourneyEntry[]>([]);
  const [decisionReason, setDecisionReason] = useState("");
  const [judgmentDraft, setJudgmentDraft] = useState<JudgedFindingInput>(EMPTY_JUDGMENT);
  const [gapDraft, setGapDraft] = useState({ label: "", detail: "" });
  const [auditBrief, setAuditBrief] = useState<AuditBrief | null>(null);
  const [reviewResults, setReviewResults] = useState<ReviewResult[]>([]);
  const [activePreviewFindingId, setActivePreviewFindingId] = useState<string | null>(null);
  cssDraftRef.current = cssDraft;

  useEffect(
    () => () => {
      if (auditTimerRef.current !== null) window.clearTimeout(auditTimerRef.current);
      if (auditEndTimerRef.current !== null) window.clearTimeout(auditEndTimerRef.current);
      const waiters = auditWaiters.current;
      auditWaiters.current = [];
      for (const waiter of waiters)
        waiter.reject(new Error("The workbench closed before the measurement finished."));
    },
    [],
  );

  useEffect(() => {
    setDecisionReason(selectedId ? (decisionsRef.current[selectedId]?.reason ?? "") : "");
  }, [selectedId]);

  const pushActivity = useCallback(
    (actor: Actor, action: string, detail: string, toolName?: string) => {
      const entry: Activity = {
        id: `${Date.now()}-${activitySequence.current++}`,
        actor,
        action,
        detail,
        at: nowIso(),
        ...(toolName ? { toolName } : {}),
      };
      activityRef.current = [entry, ...activityRef.current].slice(0, MAX_ACTIVITY_RECEIPTS);
      setActivity(activityRef.current);
      return entry;
    },
    [],
  );

  const invalidateVerification = useCallback((findings: AuditSnapshot["findings"]) => {
    const next = invalidateVerificationForFindings(verificationRef.current, findings);
    if (next === verificationRef.current) return;
    verificationRef.current = next;
    setVerification(next);
  }, []);

  const commitSnapshot = useCallback(
    (snapshot: AuditSnapshot, options: { replaceBaseline?: boolean } = {}) => {
      currentRef.current = { ...currentRef.current, [snapshot.viewport]: snapshot };
      setCurrentSnapshots(currentRef.current);

      const replaceBaseline = options.replaceBaseline ?? snapshot.demoState === "baseline";
      if (replaceBaseline) {
        invalidateVerification(snapshot.findings);
        baselineRef.current = { ...baselineRef.current, [snapshot.viewport]: snapshot };
        setBaselineSnapshots(baselineRef.current);
        const first = snapshot.findings[0]?.id ?? null;
        if (
          !selectedRef.current ||
          !snapshot.findings.some((finding) => finding.id === selectedRef.current)
        ) {
          selectedRef.current = first;
          setSelectedId(first);
        }
      }

      const matching = auditWaiters.current.filter((waiter) => waiter.state === snapshot.demoState);
      auditWaiters.current = auditWaiters.current.filter(
        (waiter) => waiter.state !== snapshot.demoState,
      );
      for (const waiter of matching) waiter.resolve(snapshot);
    },
    [invalidateVerification],
  );

  const beginAudit = useCallback(() => {
    auditCountRef.current += 1;
    setAuditing(true);
  }, []);

  const finishAuditSoon = useCallback(() => {
    auditCountRef.current = Math.max(0, auditCountRef.current - 1);
    if (auditCountRef.current > 0) return;
    if (auditEndTimerRef.current !== null) window.clearTimeout(auditEndTimerRef.current);
    auditEndTimerRef.current = window.setTimeout(() => {
      auditEndTimerRef.current = null;
      if (auditCountRef.current === 0) setAuditing(false);
    }, 520);
  }, []);

  const measureFrame = useCallback(
    async (replaceBaselineOverride?: boolean) => {
      beginAudit();
      setError(null);
      try {
        const document = iframeRef.current?.contentDocument;
        if (!document?.documentElement)
          throw new Error("The included live target is not ready to measure yet.");
        const renderedState =
          document.querySelector("[data-demo-state]")?.getAttribute("data-demo-state") ===
          "improved"
            ? "improved"
            : "baseline";
        const facts = captureBrowserFacts(document, viewportRef.current);
        const checkpointId = `included-live-target-${viewportRef.current}`;
        const scopeKey = `included:/demo:${viewportRef.current}`;
        const measuredSnapshot: AuditSnapshot = {
          capturedAt: nowIso(),
          demoState: renderedState,
          viewport: viewportRef.current,
          viewportSize: facts.viewportSize,
          scopeKey,
          findings: deriveFindings(facts).toSorted(compareFindingsForReview),
          gaps: SAMPLE_GAPS.map((gap) => ({ ...gap, checkpointId, scopeKey })),
        };
        const replaceBaseline =
          replaceBaselineOverride ?? measuredSnapshot.demoState === "baseline";
        const previous = baselineRef.current[measuredSnapshot.viewport];
        const snapshot =
          replaceBaseline && previous
            ? mergeJourneySnapshots(previous, measuredSnapshot)
            : measuredSnapshot;
        if (shouldCommitMeasuredSnapshot(snapshot.demoState, snapshot.findings.length)) {
          commitSnapshot(snapshot, { replaceBaseline });
        }
        return snapshot;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Sundae could not measure the included target.";
        setError(message);
        throw new Error(message, { cause });
      } finally {
        finishAuditSoon();
      }
    },
    [beginAudit, commitSnapshot, finishAuditSoon],
  );

  const fetchRemote = useCallback(
    async (url: string, activeViewport: Viewport, options: RemoteCheckpointOptions = {}) => {
      beginAudit();
      setError(null);
      try {
        return await requestCheckpoint(url, activeViewport, options);
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Sundae could not capture this page.";
        setError(message);
        throw new Error(message, { cause });
      } finally {
        finishAuditSoon();
      }
    },
    [beginAudit, finishAuditSoon],
  );

  const resetEvidence = useCallback(() => {
    committedSystemBaselineRef.current = null;
    baselineRef.current = {};
    currentRef.current = {};
    baselineCheckpointRef.current = {};
    checkpointRef.current = null;
    previewCssRef.current = undefined;
    previewFindingIdRef.current = null;
    fullPageRef.current = false;
    waitForSelectorRef.current = undefined;
    verificationRef.current = {};
    selectedRef.current = null;
    judgmentSequence.current = 0;
    reviewResultSequence.current = 0;
    auditBriefRef.current = null;
    reviewResultsRef.current = [];
    journeyRef.current = [];
    visibleNavRef.current = [];
    checkpointRecordsRef.current.clear();
    approvedUrlsRef.current.clear();
    draftApprovalRef.current = null;
    setBaselineSnapshots({});
    setCurrentSnapshots({});
    setCheckpoint(null);
    setVerification({});
    setSelectedId(null);
    setCssDraft("");
    setWaitForSelectorDraft("");
    setJourney([]);
    setDraftApproved(false);
    decisionsRef.current = {};
    setDecisions({});
    setDecisionReason("");
    setJudgmentDraft(EMPTY_JUDGMENT);
    setGapDraft({ label: "", detail: "" });
    setAuditBrief(null);
    setReviewResults([]);
    setActivePreviewFindingId(null);
  }, []);

  const beginRemoteOperation = useCallback(() => {
    return latestOperationRef.current.begin();
  }, []);

  const assertCurrentOperation = useCallback((epoch: number, signal?: AbortSignal) => {
    latestOperationRef.current.assertCurrent(epoch, signal);
  }, []);

  const activateCheckpoint = useCallback(
    (checkpointId: string) => {
      const record = checkpointRecordsRef.current.get(checkpointId);
      if (!record) return false;
      beginRemoteOperation();
      checkpointRef.current = record.checkpoint;
      remoteUrlRef.current = record.captureUrl;
      fullPageRef.current = record.checkpoint.capture.fullPage;
      waitForSelectorRef.current = record.checkpoint.capture.waitForSelector;
      baselineCheckpointRef.current = { [record.checkpoint.viewport]: record.checkpoint };
      approvedUrlsRef.current.add(record.captureUrl);
      previewCssRef.current = undefined;
      previewFindingIdRef.current = null;
      demoStateRef.current = "baseline";
      viewportRef.current = record.checkpoint.viewport;
      setCheckpoint(record.checkpoint);
      setUrlDraft(record.checkpoint.target.displayUrl);
      setWaitForSelectorDraft(record.checkpoint.capture.waitForSelector ?? "");
      setCssDraft("");
      setDemoState("baseline");
      setActivePreviewFindingId(null);
      setViewport(record.checkpoint.viewport);
      const baseline = baselineRef.current[record.checkpoint.viewport];
      if (baseline) {
        currentRef.current = { ...currentRef.current, [record.checkpoint.viewport]: baseline };
        setCurrentSnapshots(currentRef.current);
      }
      return true;
    },
    [beginRemoteOperation],
  );

  const capturePublicPage = useCallback(
    async (
      url: string,
      nextViewport: Viewport,
      actor: Actor,
      signal?: AbortSignal,
      waitForSelector?: string,
      toolName?: string,
    ): Promise<CommandResult> => {
      const cleanUrl = url.trim();
      if (!cleanUrl) throw new Error("Enter the public page URL you want to audit.");
      const approvedUrl = assertApprovedForActor(actor, cleanUrl, approvedUrlsRef.current);
      const continuesAudit = modeRef.current === "remote" && remoteUrlRef.current === approvedUrl;
      const waitSelector = resolveWaitForSelector(waitForSelector);
      const operationEpoch = beginRemoteOperation();
      setCaptureProgress("rendering");
      try {
        const nextCheckpoint = await fetchRemote(approvedUrl, nextViewport, {
          waitForSelector: waitSelector,
          signal,
          fullPage: true,
        });
        assertCurrentOperation(operationEpoch, signal);
        setCaptureProgress("measuring");

        if (!continuesAudit) resetEvidence();
        const visibleNav = [
          ...new Map(
            [...visibleNavRef.current, ...nextCheckpoint.visibleNav].map((route) => [
              canonicalizeApprovedUrl(route.url),
              route,
            ]),
          ).values(),
        ].slice(0, 4);
        visibleNavRef.current = visibleNav;
        modeRef.current = "remote";
        viewportRef.current = nextViewport;
        demoStateRef.current = "baseline";
        previewCssRef.current = undefined;
        previewFindingIdRef.current = null;
        remoteUrlRef.current = approvedUrl;
        fullPageRef.current = nextCheckpoint.capture.fullPage;
        waitForSelectorRef.current = waitSelector;
        checkpointRef.current = nextCheckpoint;
        checkpointRecordsRef.current.set(nextCheckpoint.id, {
          checkpoint: nextCheckpoint,
          captureUrl: approvedUrl,
        });
        approvedUrlsRef.current = new Set([
          ...approvedUrlsRef.current,
          approvedUrl,
          ...visibleNav.map((route) => canonicalizeApprovedUrl(route.url)),
        ]);
        draftApprovalRef.current = null;
        baselineCheckpointRef.current = {
          ...baselineCheckpointRef.current,
          [nextViewport]: nextCheckpoint,
        };
        setMode("remote");
        setViewport(nextViewport);
        setDemoState("baseline");
        setActivePreviewFindingId(null);
        setCheckpoint(nextCheckpoint);
        setUrlDraft(nextCheckpoint.target.displayUrl);
        setWaitForSelectorDraft(waitSelector ?? "");
        setDraftApproved(true);

        const snapshot = snapshotFromCheckpoint(nextCheckpoint);
        setCaptureProgress("grouping");
        const uncapturedNav = uncapturedVisibleNav(visibleNav, [
          approvedUrl,
          ...journeyRef.current.map((step) => step.displayUrl),
        ]);
        if (uncapturedNav.length > 0) {
          snapshot.gaps = [
            ...snapshot.gaps,
            {
              ...visibleNavGap(uncapturedNav.length),
              checkpointId: nextCheckpoint.id,
              scopeKey: nextCheckpoint.scopeId,
            },
          ];
        }
        commitSnapshot(snapshot);
        const firstStep: JourneyEntry = {
          checkpointId: nextCheckpoint.id,
          scopeId: nextCheckpoint.scopeId,
          label: nextCheckpoint.title || "Entry page",
          displayUrl: nextCheckpoint.target.displayUrl,
          capturedAt: nextCheckpoint.capturedAt,
          findingCount: snapshot.findings.length,
          viewport: nextCheckpoint.viewport,
          surfaceType: "entry",
          state: "settled render",
          captureExtent: nextCheckpoint.capture.fullPage ? "full-page" : "viewport",
          reason: continuesAudit
            ? `Add ${nextViewport} evidence for the same approved page`
            : "Establish the visible proposition and entry job",
          motion: "not_seen",
        };
        journeyRef.current = continuesAudit
          ? [...journeyRef.current, firstStep].slice(-12)
          : [firstStep];
        setJourney(journeyRef.current);
        const browserMs = browserMsReceipt(nextCheckpoint);
        pushActivity(
          actor,
          "Captured public page",
          `${nextCheckpoint.target.displayUrl} · ${nextViewport} · ${nextCheckpoint.id}${browserMs.suffix}`,
          toolName,
        );
        return {
          ok: true,
          receipt: `Created rendered checkpoint ${nextCheckpoint.id}.`,
          target: nextCheckpoint.target,
          checkpoint_id: nextCheckpoint.id,
          scope_id: nextCheckpoint.scopeId,
          viewport: nextCheckpoint.viewport,
          capture_extent: nextCheckpoint.capture.fullPage ? "full-page" : "viewport",
          measured_finding_count: snapshot.findings.length,
          coverage_gaps: snapshot.gaps,
          visible_nav: uncapturedNav,
          next: uncapturedNav.length
            ? "Call get_board_context, then capture_visible_nav for the listed same-origin routes."
            : "Inspect the screenshot, then use record_visual_finding for visible product judgments.",
          ...browserMs.fields,
        };
      } finally {
        setCaptureProgress(null);
      }
    },
    [
      assertCurrentOperation,
      beginRemoteOperation,
      commitSnapshot,
      fetchRemote,
      pushActivity,
      resetEvidence,
    ],
  );

  const captureJourneyStep = useCallback(
    async (
      url: string,
      label: string,
      actor: Actor,
      signal?: AbortSignal,
      waitForSelector?: string,
      toolName?: string,
      operationEpoch?: number,
    ): Promise<CommandResult> => {
      if (modeRef.current !== "remote" || !checkpointRef.current) {
        throw new Error("Start a public-page audit before appending a journey step.");
      }
      const cleanUrl = url.trim();
      const cleanLabel = boundedText(label, 100);
      if (!cleanUrl || !cleanLabel)
        throw new Error("A journey step needs a public URL and a short label.");
      const authorizedUrl = assertSameJourneyOrigin(checkpointRef.current.target.origin, cleanUrl);
      const approvedUrl = assertApprovedForActor(actor, authorizedUrl, approvedUrlsRef.current);
      const waitSelector = resolveWaitForSelector(waitForSelector, waitForSelectorRef.current);

      const activeOperation = operationEpoch ?? beginRemoteOperation();
      const nextCheckpoint = await fetchRemote(authorizedUrl, viewportRef.current, {
        waitForSelector: waitSelector,
        signal,
        fullPage: true,
      });
      assertCurrentOperation(activeOperation, signal);
      const stepSnapshot = snapshotFromCheckpoint(nextCheckpoint);
      const previous = baselineRef.current[viewportRef.current];
      if (!previous) throw new Error("The active audit does not have baseline evidence.");
      const aggregate = mergeJourneySnapshots(previous, stepSnapshot);
      aggregate.findings.sort(compareFindingsForReview);
      const remainingVisibleNav = uncapturedVisibleNav(visibleNavRef.current, [
        authorizedUrl,
        ...journeyRef.current.map((step) => step.displayUrl),
      ]);
      aggregate.gaps = reconcileVisibleNavGap(aggregate.gaps, remainingVisibleNav.length, {
        checkpointId: journeyRef.current[0]?.checkpointId ?? nextCheckpoint.id,
        scopeKey: journeyRef.current[0]?.scopeId ?? nextCheckpoint.scopeId,
      });

      remoteUrlRef.current = authorizedUrl;
      fullPageRef.current = nextCheckpoint.capture.fullPage;
      waitForSelectorRef.current = waitSelector;
      checkpointRef.current = nextCheckpoint;
      checkpointRecordsRef.current.set(nextCheckpoint.id, {
        checkpoint: nextCheckpoint,
        captureUrl: approvedUrl,
      });
      approvedUrlsRef.current.add(approvedUrl);
      draftApprovalRef.current = null;
      baselineCheckpointRef.current = { [viewportRef.current]: nextCheckpoint };
      setCheckpoint(nextCheckpoint);
      setUrlDraft(nextCheckpoint.target.displayUrl);
      setWaitForSelectorDraft(waitSelector ?? "");
      setDraftApproved(false);
      commitSnapshot(aggregate);
      if (remainingVisibleNav.length === 0) {
        baselineRef.current = clearVisibleNavGaps(baselineRef.current);
        currentRef.current = clearVisibleNavGaps(currentRef.current);
        setBaselineSnapshots(baselineRef.current);
        setCurrentSnapshots(currentRef.current);
      }
      const entry: JourneyEntry = {
        checkpointId: nextCheckpoint.id,
        scopeId: nextCheckpoint.scopeId,
        label: cleanLabel,
        displayUrl: nextCheckpoint.target.displayUrl,
        capturedAt: nextCheckpoint.capturedAt,
        findingCount: stepSnapshot.findings.length,
        viewport: nextCheckpoint.viewport,
        surfaceType: inferSurfaceType(cleanLabel, nextCheckpoint.target.displayUrl),
        state: cleanLabel,
        captureExtent: nextCheckpoint.capture.fullPage ? "full-page" : "viewport",
        reason: `Human-named journey evidence: ${cleanLabel}`,
        motion: "not_seen",
      };
      journeyRef.current = [...journeyRef.current, entry].slice(-12);
      setJourney(journeyRef.current);
      const browserMs = browserMsReceipt(nextCheckpoint);
      pushActivity(
        actor,
        "Captured journey step",
        `${cleanLabel} · ${nextCheckpoint.target.displayUrl} · ${nextCheckpoint.id}${browserMs.suffix}`,
        toolName,
      );
      return {
        ok: true,
        receipt: `Appended “${cleanLabel}” as checkpoint ${nextCheckpoint.id}.`,
        checkpoint_id: nextCheckpoint.id,
        scope_id: nextCheckpoint.scopeId,
        step_count: journeyRef.current.length,
        new_finding_count: stepSnapshot.findings.length,
        total_finding_count: aggregate.findings.length,
        coverage_gaps: aggregate.gaps,
        ...browserMs.fields,
      };
    },
    [assertCurrentOperation, beginRemoteOperation, commitSnapshot, fetchRemote, pushActivity],
  );

  const captureVisibleNav = useCallback(
    async (
      actor: Actor,
      signal?: AbortSignal,
      waitForSelector?: string,
      toolName?: string,
    ): Promise<CommandResult> => {
      if (modeRef.current !== "remote" || !checkpointRef.current) {
        throw new Error("Start a public-page audit before capturing visible navigation.");
      }
      if (demoStateRef.current !== "baseline") {
        throw new Error("Reset the reversible preview before capturing visible navigation.");
      }
      const entry = journeyRef.current[0]
        ? checkpointRecordsRef.current.get(journeyRef.current[0].checkpointId)
        : undefined;
      const routes = uncapturedVisibleNav(visibleNavRef.current, [
        remoteUrlRef.current,
        ...journeyRef.current.map((step) => step.displayUrl),
      ]);
      if (routes.length === 0) {
        throw new Error("No uncaptured visible navigation routes remain on this board.");
      }
      const routeWaitSelector = waitForSelector ?? "";
      const operationEpoch = beginRemoteOperation();
      let failure: Error | null = null;
      try {
        for (const route of routes) {
          signal?.throwIfAborted();
          await captureJourneyStep(
            route.url,
            route.label,
            actor,
            signal,
            routeWaitSelector,
            toolName,
            operationEpoch,
          );
        }
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") throw cause;
        failure = cause instanceof Error ? cause : new Error("The capture could not be completed.");
      } finally {
        if (entry) activateCheckpoint(entry.checkpoint.id);
      }
      const remaining = uncapturedVisibleNav(visibleNavRef.current, [
        remoteUrlRef.current,
        ...journeyRef.current.map((step) => step.displayUrl),
      ]);
      const capturedLabels = capturedVisibleNavLabels(routes, remaining);
      if (failure) {
        return {
          ok: false,
          receipt: `Captured ${capturedLabels.length} visible navigation route${capturedLabels.length === 1 ? "" : "s"}; ${remaining.length} remain after the provider stopped the batch.`,
          captured_routes: capturedLabels,
          remaining_count: remaining.length,
          error: failure.message.slice(0, 280),
          checkpoint_id: checkpointRef.current?.id ?? null,
          scope_id: checkpointRef.current?.scopeId ?? null,
          next: "Read get_board_context before retrying any remaining evidence-derived route.",
        };
      }
      return {
        ok: true,
        receipt: `Captured ${capturedLabels.length} visible navigation route${capturedLabels.length === 1 ? "" : "s"}.`,
        captured_routes: capturedLabels,
        remaining_count: remaining.length,
        checkpoint_id: checkpointRef.current?.id ?? null,
        scope_id: checkpointRef.current?.scopeId ?? null,
        next:
          remaining.length > 0
            ? "Call get_board_context."
            : "Call get_board_context, then continue the design sweep.",
      };
    },
    [activateCheckpoint, beginRemoteOperation, captureJourneyStep],
  );

  const captureBelowFold = useCallback(
    async (
      waitForSelector: string | undefined,
      actor: Actor,
      signal?: AbortSignal,
      toolName?: string,
    ): Promise<CommandResult> => {
      if (modeRef.current !== "remote" || !checkpointRef.current) {
        throw new Error("Start a public-page audit before adding below-fold evidence.");
      }
      if (demoStateRef.current !== "baseline") {
        throw new Error(
          "Reset the reversible preview before adding a baseline below-fold checkpoint.",
        );
      }
      const activeUrl = assertApprovedForActor(
        actor,
        remoteUrlRef.current,
        approvedUrlsRef.current,
      );
      const waitSelector = resolveWaitForSelector(waitForSelector, waitForSelectorRef.current);
      const operationEpoch = beginRemoteOperation();
      const nextCheckpoint = await fetchRemote(activeUrl, viewportRef.current, {
        fullPage: true,
        waitForSelector: waitSelector,
        signal,
      });
      assertCurrentOperation(operationEpoch, signal);

      const stepSnapshot = snapshotFromCheckpoint(nextCheckpoint);
      const previous = baselineRef.current[viewportRef.current];
      if (!previous) throw new Error("The active audit does not have baseline evidence.");
      const aggregate = mergeBelowFoldSnapshot(
        previous,
        stepSnapshot,
        nextCheckpoint.capture.fullPage,
      );
      aggregate.findings.sort(compareFindingsForReview);

      fullPageRef.current = nextCheckpoint.capture.fullPage;
      waitForSelectorRef.current = waitSelector;
      checkpointRef.current = nextCheckpoint;
      checkpointRecordsRef.current.set(nextCheckpoint.id, {
        checkpoint: nextCheckpoint,
        captureUrl: activeUrl,
      });
      baselineCheckpointRef.current = { [viewportRef.current]: nextCheckpoint };
      setCheckpoint(nextCheckpoint);
      setWaitForSelectorDraft(waitSelector ?? "");
      commitSnapshot(aggregate);
      const entry: JourneyEntry = {
        checkpointId: nextCheckpoint.id,
        scopeId: nextCheckpoint.scopeId,
        label: nextCheckpoint.capture.fullPage ? "Below fold" : "Viewport fallback",
        displayUrl: nextCheckpoint.target.displayUrl,
        capturedAt: nextCheckpoint.capturedAt,
        findingCount: stepSnapshot.findings.length,
        viewport: nextCheckpoint.viewport,
        surfaceType:
          journeyRef.current.findLast(({ scopeId }) => scopeId === nextCheckpoint.scopeId)
            ?.surfaceType ?? "other",
        state: "settled render",
        captureExtent: nextCheckpoint.capture.fullPage ? "full-page" : "viewport",
        reason: "Extend the active route beyond the first viewport",
        motion: "not_seen",
      };
      journeyRef.current = [...journeyRef.current, entry].slice(-12);
      setJourney(journeyRef.current);
      const browserMs = browserMsReceipt(nextCheckpoint);
      pushActivity(
        actor,
        "Captured below fold",
        `${nextCheckpoint.target.displayUrl} · ${nextCheckpoint.capture.fullPage ? "full page" : "viewport fallback"} · ${nextCheckpoint.id}${browserMs.suffix}`,
        toolName,
      );
      const captureExtent = nextCheckpoint.capture.fullPage ? "full-page" : "viewport";
      return {
        ok: true,
        receipt: `Appended ${nextCheckpoint.capture.fullPage ? "Below fold" : "a viewport fallback"} as checkpoint ${nextCheckpoint.id}.`,
        checkpoint_id: nextCheckpoint.id,
        scope_id: nextCheckpoint.scopeId,
        capture_extent: captureExtent,
        step_count: journeyRef.current.length,
        new_finding_count: stepSnapshot.findings.length,
        total_finding_count: aggregate.findings.length,
        coverage_gaps: aggregate.gaps,
        ...browserMs.fields,
      };
    },
    [assertCurrentOperation, beginRemoteOperation, commitSnapshot, fetchRemote, pushActivity],
  );

  const boardContextPayload = useCallback(
    (findingOffset?: number) => {
      const baseline = baselineRef.current[viewportRef.current];
      if (!baseline) return null;
      const current = currentRef.current[viewportRef.current];
      const board = describeEvidenceBoard(
        baseline,
        current,
        demoStateRef.current,
        viewportRef.current,
      );
      const coverage = deriveCoverageSummary({
        mode: modeRef.current,
        baseline,
        current,
        trail: journeyRef.current,
        baselinesByViewport: baselineRef.current,
        hasVerification: baseline.findings.some(
          ({ id }) => verificationRef.current[id] !== undefined,
        ),
      });
      return buildAgentBoardContext({
        auditGoal: currentAuditGoal,
        target:
          modeRef.current === "remote"
            ? {
                kind: "public_checkpoint",
                displayUrl: checkpointRef.current?.target.displayUrl ?? null,
                checkpointId: checkpointRef.current?.id ?? null,
                scopeId: checkpointRef.current?.scopeId ?? null,
                screenshotVisible: Boolean(checkpointRef.current?.screenshotDataUrl),
                captureExtent: checkpointRef.current?.capture.fullPage ? "full-page" : "viewport",
              }
            : {
                kind: "included_live_target",
                path: "/demo",
                scopeId: baseline.scopeKey ?? `included:/demo:${baseline.viewport}`,
                screenshotVisible: true,
              },
        viewport: baseline.viewport,
        state: demoStateRef.current,
        currentFindingCount: board.currentCount,
        retainedBaselineFindingCount: board.retainsBaseline ? board.baselineCount : 0,
        currentMeasuredAt: current?.capturedAt ?? null,
        selectedFindingId: selectedRef.current,
        retainsBaseline: board.retainsBaseline,
        findings: baseline.findings,
        decisions: decisionsRef.current,
        verifications: verificationRef.current,
        coverageGaps: coverage.openGaps,
        trailStepCount: journeyRef.current.length,
        uncapturedNav: uncapturedVisibleNav(visibleNavRef.current, [
          remoteUrlRef.current,
          ...journeyRef.current.map((step) => step.displayUrl),
        ]),
        findingOffset,
        auditBrief: auditBriefRef.current,
        reviewResults: reviewResultsRef.current,
        coverage,
      });
    },
    [currentAuditGoal],
  );

  const auditCurrentScope = useCallback(
    async (
      actor: Actor,
      signal?: AbortSignal,
      waitForSelector?: string,
      toolName?: string,
    ): Promise<CommandResult> => {
      signal?.throwIfAborted();
      if (modeRef.current === "sample") {
        const snapshot = await measureFrame();
        signal?.throwIfAborted();
        const scopeId = snapshot.scopeKey ?? `included:/demo:${snapshot.viewport}`;
        committedSystemBaselineRef.current =
          committedSystemBaselineKey(scopeId, snapshot.demoState, snapshot.findings.length) ??
          committedSystemBaselineRef.current;
        if (shouldCommitMeasuredSnapshot(snapshot.demoState, snapshot.findings.length)) {
          pushActivity(
            actor,
            actor === "system" && countAgentToolCalls(activityRef.current) === 0
              ? "Baseline measurement · no agent tool has run yet"
              : "Measured live target",
            `${snapshot.findings.length} findings · ${snapshot.viewportSize.width}×${snapshot.viewportSize.height} · ${snapshot.demoState}`,
            toolName,
          );
        }
        return withFirstBoardPage(
          {
            ok: true,
            receipt: `Measured the ${snapshot.demoState} ${snapshot.viewport} live target in this browser.`,
            scope_id: scopeId,
            scope: snapshot.viewport,
            state: snapshot.demoState,
            finding_count: snapshot.findings.length,
            coverage_gap_count: snapshot.gaps.length,
            measured_at: snapshot.capturedAt,
          },
          boardContextPayload(0),
        );
      }

      const activeUrl = remoteUrlRef.current;
      if (!activeUrl) throw new Error("Choose a public URL before running this audit.");
      const previousCheckpointId = checkpointRef.current?.id;
      const waitSelector = resolveWaitForSelector(waitForSelector, waitForSelectorRef.current);
      const operationEpoch = beginRemoteOperation();
      const nextCheckpoint = await fetchRemote(activeUrl, viewportRef.current, {
        previewCss: previewCssRef.current,
        fullPage: fullPageRef.current,
        waitForSelector: waitSelector,
        signal,
      });
      assertCurrentOperation(operationEpoch, signal);
      fullPageRef.current = nextCheckpoint.capture.fullPage;
      waitForSelectorRef.current = waitSelector;
      checkpointRef.current = nextCheckpoint;
      checkpointRecordsRef.current.set(nextCheckpoint.id, {
        checkpoint: nextCheckpoint,
        captureUrl: activeUrl,
      });
      setCheckpoint(nextCheckpoint);
      setWaitForSelectorDraft(waitSelector ?? "");
      if (!previewCssRef.current)
        baselineCheckpointRef.current = { [viewportRef.current]: nextCheckpoint };
      const routeSnapshot = snapshotFromCheckpoint(nextCheckpoint);
      const previous = baselineRef.current[viewportRef.current];
      const snapshot =
        !previewCssRef.current && previous
          ? mergeJourneySnapshots(previous, routeSnapshot)
          : routeSnapshot;
      commitSnapshot(snapshot, { replaceBaseline: !previewCssRef.current });
      if (!previewCssRef.current) {
        journeyRef.current = journeyRef.current.map((entry) =>
          entry.checkpointId === previousCheckpointId
            ? {
                ...entry,
                checkpointId: nextCheckpoint.id,
                capturedAt: nextCheckpoint.capturedAt,
                findingCount: routeSnapshot.findings.length,
                viewport: nextCheckpoint.viewport,
                captureExtent: nextCheckpoint.capture.fullPage ? "full-page" : "viewport",
              }
            : entry,
        );
        setJourney(journeyRef.current);
      }
      const browserMs = browserMsReceipt(nextCheckpoint);
      pushActivity(
        actor,
        "Recaptured public page",
        `${nextCheckpoint.target.displayUrl} · ${nextCheckpoint.id}${browserMs.suffix}`,
        toolName,
      );
      return withFirstBoardPage(
        {
          ok: true,
          receipt: `Created fresh checkpoint ${nextCheckpoint.id}.`,
          checkpoint_id: nextCheckpoint.id,
          scope_id: nextCheckpoint.scopeId,
          state: snapshot.demoState,
          finding_count: snapshot.findings.length,
          coverage_gap_count: snapshot.gaps.length,
          measured_at: snapshot.capturedAt,
          ...browserMs.fields,
        },
        boardContextPayload(0),
      );
    },
    [
      assertCurrentOperation,
      beginRemoteOperation,
      boardContextPayload,
      commitSnapshot,
      fetchRemote,
      measureFrame,
      pushActivity,
    ],
  );

  const appendFindings = useCallback((incoming: Finding[]) => {
    if (incoming.length === 0) return [];
    const activeViewport = viewportRef.current;
    const baseline = baselineRef.current[activeViewport];
    if (!baseline) throw new Error("Run an audit before adding evidence.");
    const existing = new Set(baseline.findings.map((finding) => finding.id));
    const additions = incoming.filter((finding) => !existing.has(finding.id));
    if (additions.length === 0) return [];
    const nextBaseline = {
      ...baseline,
      findings: [...baseline.findings, ...additions].toSorted(compareFindingsForReview),
    };
    baselineRef.current = { ...baselineRef.current, [activeViewport]: nextBaseline };
    setBaselineSnapshots(baselineRef.current);
    if (demoStateRef.current === "baseline") {
      currentRef.current = { ...currentRef.current, [activeViewport]: nextBaseline };
      setCurrentSnapshots(currentRef.current);
    }
    selectedRef.current = additions[0]!.id;
    setSelectedId(additions[0]!.id);
    return additions;
  }, []);

  const appendGap = useCallback((gap: CoverageGap) => {
    const activeViewport = viewportRef.current;
    const baseline = baselineRef.current[activeViewport];
    if (!baseline) throw new Error("Run an audit before recording a coverage gap.");
    const scopeKey = gap.scopeKey ?? checkpointRef.current?.scopeId ?? baseline.scopeKey;
    const scopedGap = {
      ...gap,
      checkpointId: gap.checkpointId ?? checkpointRef.current?.id,
      scopeKey,
    };
    if (
      baseline.gaps.some(
        (current) =>
          current.label.toLowerCase() === gap.label.toLowerCase() && current.scopeKey === scopeKey,
      )
    )
      return false;
    if (baseline.gaps.length >= MAX_COVERAGE_GAPS) {
      throw new Error(
        `This scope already retains ${MAX_COVERAGE_GAPS} coverage gaps. Start a new audit before adding more.`,
      );
    }
    const nextBaseline = { ...baseline, gaps: [...baseline.gaps, scopedGap] };
    baselineRef.current = { ...baselineRef.current, [activeViewport]: nextBaseline };
    setBaselineSnapshots(baselineRef.current);
    if (demoStateRef.current === "baseline") {
      currentRef.current = { ...currentRef.current, [activeViewport]: nextBaseline };
      setCurrentSnapshots(currentRef.current);
    }
    return true;
  }, []);

  const readSampleAgentFindings = useCallback(async () => {
    const targetDocument = iframeRef.current?.contentDocument;
    const context = targetDocument?.modelContext;
    let runtimeTools: RegisteredWebMcpTool[] = [];
    let enumerationFailed = false;
    if (context?.getTools) {
      try {
        runtimeTools = (await context.getTools()).filter((tool) =>
          tool.name.startsWith("sundae_lab_"),
        );
      } catch {
        enumerationFailed = true;
      }
    }
    const runtimeStatus =
      targetDocument?.documentElement.dataset.sundaeWebmcpFixture ?? "unavailable";
    const tools =
      runtimeTools.length > 0
        ? runtimeTools.map(normalizeRuntimeToolContract)
        : DEMO_TOOL_CONTRACTS;
    const source =
      runtimeTools.length > 0
        ? "runtime getTools()"
        : `declared fixture contracts; runtime ${enumerationFailed ? "enumeration failed" : runtimeStatus}`;
    return {
      tools,
      source,
      runtimeStatus,
      findings: auditWebMcpTools(tools, viewportRef.current),
    };
  }, []);

  const inspectAgentSurface = useCallback(
    async (actor: Actor, toolName?: string): Promise<CommandResult> => {
      if (modeRef.current === "remote") {
        const gap = {
          id: `gap-remote-webmcp-${Date.now()}`,
          label: "Remote WebMCP contract",
          detail:
            "This public checkpoint includes the rendered human surface, not executable tool contracts from the remote origin.",
        };
        appendGap(gap);
        pushActivity(
          actor,
          "Named agent-surface gap",
          "Remote tool contracts were not exposed by this checkpoint.",
          toolName,
        );
        return {
          ok: true,
          receipt: "Recorded that the remote WebMCP contract was not observed.",
          supported: false,
          coverage_gap: gap,
          checkpoint_id: checkpointRef.current?.id ?? null,
          scope_id: checkpointRef.current?.scopeId ?? null,
        };
      }

      const { tools, source, runtimeStatus, findings } = await readSampleAgentFindings();
      const additions = appendFindings(findings);
      pushActivity(
        actor,
        "Inspected agent surface",
        `${tools.length} target tools via ${source} · ${additions.length} new findings`,
        toolName,
      );
      return {
        ok: true,
        receipt: `Inspected ${tools.length} target WebMCP tools via ${source} and recorded ${additions.length} new findings.`,
        inspection_source: source,
        runtime_registration_status: runtimeStatus,
        scope_id: `included:/demo:${viewportRef.current}`,
        tools: tools.map((tool) => ({
          name: tool.name,
          schema_status: tool.schemaInspection ?? "inspectable",
          read_only: tool.annotations?.readOnlyHint === true,
          untrusted_output: tool.annotations?.untrustedContentHint === true,
          origin: tool.origin ?? "same-origin controlled fixture",
          scope: "included /demo target",
          observable_invocation: "contract inspected; tool not invoked",
        })),
        findings: additions.map((finding) => ({
          id: finding.id,
          title: finding.title,
          severity: finding.severity,
        })),
      };
    },
    [appendFindings, appendGap, pushActivity, readSampleAgentFindings],
  );

  const recordAuditBrief = useCallback(
    async (input: AuditBriefInput, actor: Actor, toolName?: string): Promise<CommandResult> => {
      if (demoStateRef.current !== "baseline") {
        throw new Error("Record the product brief on baseline evidence, not a reversible preview.");
      }
      const baseline = baselineRef.current[viewportRef.current];
      if (!baseline)
        throw new Error("Run an audit before recording the provisional product brief.");
      const allowedEvidence = inspectedEvidenceRefs(
        baseline,
        checkpointRef.current,
        journeyRef.current,
      );
      if (input.evidenceRefs.some((ref) => !allowedEvidence.has(ref))) {
        throw new Error("The audit brief must cite evidence already present on the visible board.");
      }
      const hadBrief = Boolean(auditBriefRef.current);
      const brief = createAuditBrief(input, currentAuditGoal, nowIso());
      auditBriefRef.current = brief;
      setAuditBrief(brief);
      pushActivity(
        actor,
        hadBrief ? "Updated audit brief" : "Recorded audit brief",
        `${brief.productCategory} · ${brief.productJob} · ${brief.confidence} confidence`,
        toolName,
      );
      return {
        ok: true,
        receipt: `Recorded a provisional ${brief.confidence}-confidence audit brief for “${brief.productJob}”.`,
        audit_brief: {
          status: brief.status,
          product_category: brief.productCategory,
          audience: brief.audience,
          product_job: brief.productJob,
          primary_action: brief.primaryAction,
          confidence: brief.confidence,
          unresolved_question_count: brief.unresolvedQuestions.length,
        },
        checkpoint_id: checkpointRef.current?.id ?? null,
        scope_id: baseline.scopeKey ?? checkpointRef.current?.scopeId ?? null,
      };
    },
    [currentAuditGoal, pushActivity],
  );

  const recordReviewResult = useCallback(
    async (input: ReviewResultInput, actor: Actor, toolName?: string): Promise<CommandResult> => {
      if (demoStateRef.current !== "baseline") {
        throw new Error("Record review results on baseline evidence, not a reversible preview.");
      }
      const baseline = baselineRef.current[viewportRef.current];
      if (!baseline) throw new Error("Run an audit before recording a review result.");
      if (!auditBriefRef.current) {
        throw new Error("Record the provisional audit brief before recording review results.");
      }
      validateReviewResultScope(
        input,
        inspectedScopeIds(baseline, checkpointRef.current, journeyRef.current),
        inspectedEvidenceRefsForScope(
          baseline,
          checkpointRef.current,
          journeyRef.current,
          input.scopeId,
        ),
        baseline.gaps,
      );
      const conflictsWithFinding = baseline.findings.some(
        (finding) =>
          input.kind === "no_material_issue" &&
          finding.truth === "judged" &&
          finding.category === input.category &&
          (finding.scopeKey ?? input.scopeId) === input.scopeId,
      );
      if (conflictsWithFinding) {
        throw new Error(
          "No material issue cannot be recorded beside an open judgment in that category and scope.",
        );
      }
      const result = createReviewResult(input, reviewResultSequence.current++, nowIso());
      const retained =
        input.kind === "no_material_issue"
          ? reviewResultsRef.current.filter(
              (current) =>
                current.kind !== input.kind ||
                current.category !== input.category ||
                current.scopeId !== input.scopeId,
            )
          : reviewResultsRef.current;
      reviewResultsRef.current = [...retained, result].slice(-MAX_REVIEW_RESULTS);
      setReviewResults(reviewResultsRef.current);
      pushActivity(
        actor,
        result.kind === "strength" ? "Recorded product strength" : "Recorded no-issue result",
        `${result.category} · ${result.scopeId} · ${result.confidence} confidence`,
        toolName,
      );
      return {
        ok: true,
        receipt:
          result.kind === "strength"
            ? `Added a ${result.category.toUpperCase()} strength worth preserving.`
            : `Recorded no material ${result.category.toUpperCase()} issue in this inspected scope.`,
        review_result: result,
        checkpoint_id: checkpointRef.current?.id ?? null,
        scope_id: result.scopeId,
      };
    },
    [pushActivity],
  );

  const recordVisualFinding = useCallback(
    async (input: JudgedFindingInput, actor: Actor, toolName?: string): Promise<CommandResult> => {
      // A judgment always cites baseline evidence, so a visible preview does not
      // change what it attaches to, and a missing brief only means the audit is
      // unoriented. Both were ordering rules, not authority or evidence rules, and
      // refusing here stranded a reviewer who had already seen something worth saying.
      const brief = auditBriefRef.current;
      const previewVisible = demoStateRef.current !== "baseline";
      const baseline = baselineRef.current[viewportRef.current];
      if (
        (baseline?.findings.filter((finding) => finding.rule === "visual-judgment").length ?? 0) >=
        MAX_MANUAL_JUDGMENTS
      ) {
        throw new Error(
          `This scope already retains ${MAX_MANUAL_JUDGMENTS} visual judgments. Start a new audit before adding more.`,
        );
      }
      const activeScope =
        checkpointRef.current?.scopeId ??
        baseline?.scopeKey ??
        `included:/demo:${viewportRef.current}`;
      const categoryCount =
        baseline?.findings.filter(
          (finding) =>
            finding.truth === "judged" &&
            finding.category === input.category &&
            (finding.scopeKey ?? activeScope) === activeScope,
        ).length ?? 0;
      if (categoryCount >= 3) {
        throw new Error(
          "Keep the audit readable: retain at most three judgments per inspected category.",
        );
      }
      const normalized = normalizeJudgedFindingInput({
        ...input,
        productJob: input.productJob ?? brief?.productJob,
      });
      const sequence = judgmentSequence.current++;
      let finding: Finding;
      if (modeRef.current === "remote") {
        const currentCheckpoint = checkpointRef.current;
        if (!currentCheckpoint)
          throw new Error("Capture a public page before recording a visual finding.");
        finding = createJudgedFinding(currentCheckpoint, normalized, sequence);
      } else {
        finding = {
          id: `${viewportRef.current}:visual-judgment:sample-${sequence}`,
          auditId: `sample-visual-${sequence}`,
          rule: "visual-judgment",
          truth: "judged",
          severity: normalized.severity,
          confidence: normalized.confidence,
          category: normalized.category,
          productJob: normalized.productJob,
          title: normalized.title,
          observation: normalized.observation,
          whyItMatters: normalized.whyItMatters,
          recommendation: normalized.recommendation,
          viewport: viewportRef.current,
          rect: null,
          measurement: null,
          scopeKey: activeScope,
          evidence: { kind: "dom", ref: "included-live-target" },
        };
      }
      appendFindings([finding]);
      const compatibleReviewResults = withoutConflictingNoIssue(reviewResultsRef.current, finding);
      const invalidatedReviewResultCount =
        reviewResultsRef.current.length - compatibleReviewResults.length;
      reviewResultsRef.current = compatibleReviewResults;
      setReviewResults(compatibleReviewResults);
      pushActivity(actor, "Recorded visual judgment", `${finding.id} · ${finding.title}`, toolName);
      const recorded = judgmentRecordOutcome({
        findingId: finding.id,
        previewVisible,
        hasBrief: Boolean(brief),
      });
      return {
        ok: true,
        receipt: recorded.receipt,
        invalidated_no_issue_count: invalidatedReviewResultCount,
        next: recorded.next,
        finding: {
          id: finding.id,
          truth: finding.truth,
          severity: finding.severity,
          confidence: finding.confidence,
          category: finding.category,
          product_job: finding.productJob ?? null,
          checkpoint_id: finding.checkpointId ?? null,
          scope_id:
            finding.scopeKey ??
            checkpointRef.current?.scopeId ??
            `included:/demo:${finding.viewport}`,
        },
      };
    },
    [appendFindings, pushActivity],
  );

  const recordCoverageGap = useCallback(
    async (
      label: string,
      detail: string,
      actor: Actor,
      toolName?: string,
    ): Promise<CommandResult> => {
      const cleanLabel = boundedText(label, 100);
      const cleanDetail = boundedText(detail, 300);
      if (!cleanLabel || !cleanDetail)
        throw new Error("A coverage gap needs a label and a concrete explanation.");
      const gap = {
        id: `gap-${Date.now()}-${activitySequence.current}`,
        label: cleanLabel,
        detail: cleanDetail,
      };
      const added = appendGap(gap);
      pushActivity(
        actor,
        added ? "Recorded coverage gap" : "Confirmed coverage gap",
        cleanLabel,
        toolName,
      );
      return {
        ok: true,
        receipt: added
          ? `Added “${cleanLabel}” to Not seen.`
          : `“${cleanLabel}” was already present in Not seen.`,
        added,
        gap: { label: cleanLabel, detail: cleanDetail },
        checkpoint_id: checkpointRef.current?.id ?? null,
        scope_id:
          checkpointRef.current?.scopeId ??
          baselineRef.current[viewportRef.current]?.scopeKey ??
          `included:/demo:${viewportRef.current}`,
      };
    },
    [appendGap, pushActivity],
  );

  const visibleFindingById = useCallback((findingId: string) => {
    for (const snapshot of Object.values(baselineRef.current)) {
      const finding = snapshot?.findings.find((candidate) => candidate.id === findingId);
      if (finding) return finding;
    }
    return undefined;
  }, []);

  const getBoardContext = useCallback(
    (actor: Actor, findingOffset?: number, toolName?: string): CommandResult => {
      const baseline = baselineRef.current[viewportRef.current];
      pushActivity(
        actor,
        "Read evidence board",
        baseline
          ? `${baseline.findings.length} findings · ${baseline.gaps.length} named gaps`
          : "No checkpoint is available yet.",
        toolName,
      );
      return (
        boardContextPayload(findingOffset) ?? {
          ok: false,
          receipt: "The active scope has not produced a checkpoint yet.",
        }
      );
    },
    [boardContextPayload, pushActivity],
  );

  const focusFinding = useCallback(
    async (findingId: string, actor: Actor, toolName?: string): Promise<CommandResult> => {
      const finding = visibleFindingById(findingId);
      if (!finding) throw new Error(`Finding ${findingId} is not present on the current board.`);
      const activatedCheckpoint =
        modeRef.current === "remote" && finding.checkpointId
          ? activateCheckpoint(finding.checkpointId)
          : false;
      if (!activatedCheckpoint && finding.viewport !== viewportRef.current) {
        viewportRef.current = finding.viewport;
        setViewport(finding.viewport);
      }
      selectedRef.current = finding.id;
      setSelectedId(finding.id);
      setDecisionReason(decisionsRef.current[finding.id]?.reason ?? "");
      pushActivity(actor, "Focused finding", `${finding.id} · ${finding.title}`, toolName);
      window.setTimeout(() => {
        document
          .getElementById(`finding-${finding.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        inspectorRef.current?.focus({ preventScroll: true });
      }, 0);
      return {
        ok: true,
        receipt: `Focused ${finding.id} on the visible board.`,
        finding: {
          id: finding.id,
          title: finding.title,
          truth: finding.truth,
          severity: finding.severity,
          checkpoint_id: finding.checkpointId ?? null,
          scope_id:
            finding.scopeKey ??
            checkpointRef.current?.scopeId ??
            `included:/demo:${finding.viewport}`,
        },
      };
    },
    [activateCheckpoint, pushActivity, visibleFindingById],
  );

  const setFindingDecision = useCallback(
    async (
      findingId: string,
      decision: Decision,
      reason: string,
      actor: Actor,
      toolName?: string,
    ): Promise<CommandResult> => {
      const finding = visibleFindingById(findingId);
      if (!finding) throw new Error(`Finding ${findingId} is not present on the board.`);
      const cleanReason = reason.trim().slice(0, 240);
      if (!cleanReason) throw new Error("A short reason is required.");
      const record: DecisionRecord = { decision, reason: cleanReason, actor, at: nowIso() };
      decisionsRef.current = { ...decisionsRef.current, [findingId]: record };
      setDecisions(decisionsRef.current);
      setDecisionReason(cleanReason);
      selectedRef.current = findingId;
      setSelectedId(findingId);
      pushActivity(actor, `Decision: ${decision}`, `${finding.id} · ${cleanReason}`, toolName);
      return {
        ok: true,
        receipt: `Recorded a reversible ${decision} decision for ${finding.id}.`,
        finding_id: finding.id,
        decision,
        reason: cleanReason,
        checkpoint_id: finding.checkpointId ?? null,
        scope_id:
          finding.scopeKey ??
          checkpointRef.current?.scopeId ??
          `included:/demo:${finding.viewport}`,
      };
    },
    [pushActivity, visibleFindingById],
  );

  const openJourneyCheckpoint = useCallback(
    (entry: JourneyEntry) => {
      if (!activateCheckpoint(entry.checkpointId)) {
        setError("This checkpoint is no longer retained in the current browser session.");
        return;
      }
      const matching = baselineRef.current[viewportRef.current]?.findings.find(
        (finding) => finding.checkpointId === entry.checkpointId,
      );
      selectedRef.current = matching?.id ?? null;
      setSelectedId(selectedRef.current);
      pushActivity(
        "human",
        "Opened journey checkpoint",
        `${entry.label} · ${entry.displayUrl} · ${entry.checkpointId}`,
      );
    },
    [activateCheckpoint, pushActivity],
  );

  const waitForState = useCallback(
    (state: DemoState, signal?: AbortSignal) =>
      new Promise<AuditSnapshot>((resolve, reject) => {
        signal?.throwIfAborted();
        let settled = false;
        let waiter: AuditWaiter;
        const cleanup = () => {
          window.clearTimeout(timeout);
          signal?.removeEventListener("abort", onAbort);
        };
        const resolveOnce = (snapshot: AuditSnapshot) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(snapshot);
        };
        const rejectOnce = (nextError: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(nextError);
        };
        const removeWaiter = () => {
          auditWaiters.current = auditWaiters.current.filter((candidate) => candidate !== waiter);
        };
        const onAbort = () => {
          removeWaiter();
          rejectOnce(
            signal?.reason instanceof Error
              ? signal.reason
              : new DOMException("The command was cancelled.", "AbortError"),
          );
        };
        const timeout = window.setTimeout(() => {
          removeWaiter();
          rejectOnce(
            new Error("The preview changed, but its fresh browser measurement timed out."),
          );
        }, 5000);
        waiter = { state, resolve: resolveOnce, reject: rejectOnce };
        auditWaiters.current.push(waiter);
        signal?.addEventListener("abort", onAbort, { once: true });
      }),
    [],
  );

  const previewFix = useCallback(
    async (
      previewCss: string | undefined,
      actor: Actor,
      signal?: AbortSignal,
      waitForSelector?: string,
      toolName?: string,
    ): Promise<CommandResult> => {
      const selectedFinding = selectedRef.current
        ? visibleFindingById(selectedRef.current)
        : undefined;
      const findingId = selectedFinding?.id ?? null;
      const authority = evaluatePreviewAuthority({
        findingId,
        decision: findingId ? decisionsRef.current[findingId]?.decision : undefined,
        reason: findingId ? decisionsRef.current[findingId]?.reason : undefined,
        previewActive: demoStateRef.current === "improved",
        previewFindingId: previewFindingIdRef.current,
      });
      if (!authority.canPreview) throw new Error(authority.previewMessage);

      if (modeRef.current === "remote") {
        const css = previewCss?.trim();
        if (!css)
          throw new Error(
            "A public-page preview needs bounded CSS. It is rendered in a new checkpoint and never edits the source site.",
          );
        const waitSelector = resolveWaitForSelector(waitForSelector, waitForSelectorRef.current);
        const operationEpoch = beginRemoteOperation();
        const nextCheckpoint = await fetchRemote(remoteUrlRef.current, viewportRef.current, {
          previewCss: css,
          fullPage: fullPageRef.current,
          waitForSelector: waitSelector,
          signal,
        });
        assertCurrentOperation(operationEpoch, signal);
        previewCssRef.current = css;
        previewFindingIdRef.current = findingId;
        fullPageRef.current = nextCheckpoint.capture.fullPage;
        waitForSelectorRef.current = waitSelector;
        checkpointRef.current = nextCheckpoint;
        demoStateRef.current = "improved";
        setCheckpoint(nextCheckpoint);
        setWaitForSelectorDraft(waitSelector ?? "");
        setDemoState("improved");
        setActivePreviewFindingId(findingId);
        const snapshot = snapshotFromCheckpoint(
          nextCheckpoint,
          deriveCheckpointFindings(nextCheckpoint),
        );
        commitSnapshot(snapshot);
        pushActivity(
          actor,
          "Rendered CSS preview",
          `${nextCheckpoint.id} · source website unchanged`,
          toolName,
        );
        return {
          ok: true,
          receipt: `Rendered reversible preview checkpoint ${nextCheckpoint.id}.`,
          checkpoint_id: nextCheckpoint.id,
          scope_id: nextCheckpoint.scopeId,
          fresh_finding_count: snapshot.findings.length,
          next: "Call verify_recapture before describing any measured finding as fixed.",
        };
      }

      if (selectedFinding?.rule === "agent-surface") {
        throw new Error(
          "This finding changes a WebMCP contract, so the included visual preview cannot fix it. Update the tool contract, then inspect it again.",
        );
      }

      if (demoStateRef.current === "improved") {
        const snapshot = currentRef.current[viewportRef.current];
        pushActivity(
          actor,
          "Confirmed preview",
          "The included reversible improvement was already visible.",
          toolName,
        );
        return {
          ok: true,
          receipt: "The reversible improvement is already visible.",
          scope_id:
            snapshot?.scopeKey ??
            checkpointRef.current?.scopeId ??
            `included:/demo:${viewportRef.current}`,
          state: "improved",
          fresh_finding_count: snapshot?.findings.length ?? null,
        };
      }
      const snapshot = await runReversibleTransition({
        signal,
        prepare: () => waitForState("improved", signal),
        apply: () => {
          demoStateRef.current = "improved";
          setDemoState("improved");
          setAuditing(true);
          pushActivity(
            actor,
            "Previewed improvement",
            "Applied the included target's local improved state; no external product was edited.",
            toolName,
          );
        },
        rollback: () => {
          demoStateRef.current = "baseline";
          previewFindingIdRef.current = null;
          setDemoState("baseline");
          setActivePreviewFindingId(null);
          pushActivity(
            "system",
            "Rolled back preview",
            "The preview did not complete, so Sundae restored the baseline state.",
          );
        },
      });
      signal?.throwIfAborted();
      previewFindingIdRef.current = findingId;
      setActivePreviewFindingId(findingId);
      return {
        ok: true,
        receipt: "Previewed the reversible improvement and measured the rendered result.",
        scope_id: snapshot.scopeKey ?? `included:/demo:${snapshot.viewport}`,
        state: snapshot.demoState,
        fresh_finding_count: snapshot.findings.length,
        next: "Call verify_recapture before describing any finding as fixed.",
      };
    },
    [
      assertCurrentOperation,
      beginRemoteOperation,
      commitSnapshot,
      fetchRemote,
      pushActivity,
      visibleFindingById,
      waitForState,
    ],
  );

  const verifyRecapture = useCallback(
    async (
      findingId: string | undefined,
      actor: Actor,
      signal?: AbortSignal,
      waitForSelector?: string,
      toolName?: string,
    ): Promise<CommandResult> => {
      signal?.throwIfAborted();
      const requestedFindingId = findingId ?? previewFindingIdRef.current ?? selectedRef.current;
      const explicit = requestedFindingId ? visibleFindingById(requestedFindingId) : undefined;
      if (!explicit) {
        throw new Error(
          requestedFindingId
            ? `Finding ${requestedFindingId} is not present on the board.`
            : "Focus an accepted finding before verification.",
        );
      }
      const authority = evaluatePreviewAuthority({
        findingId: explicit.id,
        decision: decisionsRef.current[explicit.id]?.decision,
        reason: decisionsRef.current[explicit.id]?.reason,
        previewActive: demoStateRef.current === "improved",
        previewFindingId: previewFindingIdRef.current,
      });
      if (!authority.canVerify) throw new Error(authority.verifyMessage);
      const targets = [explicit];

      let snapshot: AuditSnapshot;
      let browserMs = { suffix: "", fields: {} as { browser_ms_used?: number } };
      if (modeRef.current === "remote") {
        const waitSelector = resolveWaitForSelector(waitForSelector, waitForSelectorRef.current);
        const operationEpoch = beginRemoteOperation();
        const nextCheckpoint = await fetchRemote(remoteUrlRef.current, viewportRef.current, {
          previewCss: previewCssRef.current,
          fullPage: fullPageRef.current,
          waitForSelector: waitSelector,
          signal,
        });
        assertCurrentOperation(operationEpoch, signal);
        fullPageRef.current = nextCheckpoint.capture.fullPage;
        waitForSelectorRef.current = waitSelector;
        checkpointRef.current = nextCheckpoint;
        checkpointRecordsRef.current.set(nextCheckpoint.id, {
          checkpoint: nextCheckpoint,
          captureUrl: remoteUrlRef.current,
        });
        setCheckpoint(nextCheckpoint);
        setWaitForSelectorDraft(waitSelector ?? "");
        snapshot = snapshotFromCheckpoint(nextCheckpoint);
        commitSnapshot(snapshot, { replaceBaseline: false });
        const priorSurface = journeyRef.current.findLast(
          ({ scopeId }) => scopeId === nextCheckpoint.scopeId,
        );
        const verificationEntry: JourneyEntry = {
          checkpointId: nextCheckpoint.id,
          scopeId: nextCheckpoint.scopeId,
          label: "Verification recapture",
          displayUrl: nextCheckpoint.target.displayUrl,
          capturedAt: nextCheckpoint.capturedAt,
          findingCount: snapshot.findings.length,
          viewport: nextCheckpoint.viewport,
          surfaceType: priorSurface?.surfaceType ?? "other",
          state: "verification",
          captureExtent: nextCheckpoint.capture.fullPage ? "full-page" : "viewport",
          reason: "Fresh comparable recapture after the visible preview decision",
          motion: "not_seen",
        };
        journeyRef.current = [...journeyRef.current, verificationEntry].slice(-12);
        setJourney(journeyRef.current);
        browserMs = browserMsReceipt(nextCheckpoint);
      } else {
        snapshot = await measureFrame(false);
        signal?.throwIfAborted();
        if (targets.some((finding) => finding.rule === "agent-surface")) {
          const agentSurface = await readSampleAgentFindings();
          signal?.throwIfAborted();
          snapshot = {
            ...snapshot,
            findings: [...snapshot.findings, ...agentSurface.findings].toSorted(
              compareFindingsForReview,
            ),
          };
          commitSnapshot(snapshot, { replaceBaseline: false });
        }
      }
      const at = nowIso();
      const comparison = buildVerificationReceipts(targets, snapshot, at);
      const nextVerification = { ...verificationRef.current, ...comparison.receipts };
      verificationRef.current = nextVerification;
      setVerification(nextVerification);
      selectedRef.current = explicit.id;
      setSelectedId(explicit.id);
      const { fixed, still_open: stillOpen, unverified } = comparison.summary;
      pushActivity(
        actor,
        "Verified by recapture",
        `${fixed} fixed · ${stillOpen} still open · ${unverified} unverified${browserMs.suffix}`,
        toolName,
      );
      return {
        ok: true,
        receipt: `Re-measured ${snapshot.viewport}; fixed is used only for reproduced measured scope.`,
        results: comparison.results,
        summary: { fixed, still_open: stillOpen, unverified },
        checkpoint_id: checkpointRef.current?.id ?? null,
        scope_id:
          snapshot.scopeKey ??
          checkpointRef.current?.scopeId ??
          `included:/demo:${snapshot.viewport}`,
        measured_at: snapshot.capturedAt,
        ...browserMs.fields,
      };
    },
    [
      assertCurrentOperation,
      beginRemoteOperation,
      commitSnapshot,
      fetchRemote,
      measureFrame,
      pushActivity,
      readSampleAgentFindings,
      visibleFindingById,
    ],
  );

  const setFindingDecisionWithFollowThrough = useCallback(
    async (
      findingId: string,
      decision: Decision,
      reason: string,
      actor: Actor,
      toolName?: string,
    ): Promise<CommandResult> => {
      const accept = await setFindingDecision(findingId, decision, reason, actor, toolName);
      const kind = acceptFollowThroughKind({
        decision,
        mode: modeRef.current,
        previewCss: cssDraftRef.current,
      });
      if (kind === "none" || !accept.ok) return accept;
      try {
        return await runAcceptFollowThrough({
          kind,
          accept,
          findingId,
          actor,
          waitForSelector: waitForSelectorRef.current,
          toolName,
          previewCss: modeRef.current === "remote" ? cssDraftRef.current : undefined,
          previewFix,
          verifyRecapture,
          auditCurrentScope,
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Follow-through did not complete.";
        return {
          ...accept,
          receipt: `${acceptFollowThroughReceipt(kind, accept.receipt)} ${message}`,
          follow_through_error: message,
        };
      }
    },
    [auditCurrentScope, previewFix, setFindingDecision, verifyRecapture],
  );

  const actualCommands: WorkbenchCommands = {
    capturePublicPage,
    captureJourneyStep,
    captureVisibleNav,
    captureBelowFold,
    auditCurrentScope,
    inspectAgentSurface,
    getBoardContext,
    recordAuditBrief,
    recordReviewResult,
    recordVisualFinding,
    recordCoverageGap,
    focusFinding,
    setFindingDecision: setFindingDecisionWithFollowThrough,
    previewFix,
    verifyRecapture,
  };
  commandRef.current = actualCommands;
  const commands = useMemo<WorkbenchCommands>(
    () => ({
      capturePublicPage: (...args) => commandRef.current!.capturePublicPage(...args),
      captureJourneyStep: (...args) => commandRef.current!.captureJourneyStep(...args),
      captureVisibleNav: (...args) => commandRef.current!.captureVisibleNav(...args),
      captureBelowFold: (...args) => commandRef.current!.captureBelowFold(...args),
      auditCurrentScope: (...args) => commandRef.current!.auditCurrentScope(...args),
      inspectAgentSurface: (...args) => commandRef.current!.inspectAgentSurface(...args),
      getBoardContext: (...args) => commandRef.current!.getBoardContext(...args),
      recordAuditBrief: (...args) => commandRef.current!.recordAuditBrief(...args),
      recordReviewResult: (...args) => commandRef.current!.recordReviewResult(...args),
      recordVisualFinding: (...args) => commandRef.current!.recordVisualFinding(...args),
      recordCoverageGap: (...args) => commandRef.current!.recordCoverageGap(...args),
      focusFinding: (...args) => commandRef.current!.focusFinding(...args),
      setFindingDecision: (...args) => commandRef.current!.setFindingDecision(...args),
      previewFix: (...args) => commandRef.current!.previewFix(...args),
      verifyRecapture: (...args) => commandRef.current!.verifyRecapture(...args),
    }),
    [],
  );

  const resolveVisibleCommand = useCallback(async (command: Promise<unknown>) => {
    try {
      setError(null);
      await command;
      return true;
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError")) {
        setError(
          cause instanceof Error ? cause.message : "Sundae could not complete the browser action.",
        );
      }
      return false;
    }
  }, []);

  const runVisibleCommand = useCallback(
    (command: Promise<unknown>) => {
      void resolveVisibleCommand(command);
    },
    [resolveVisibleCommand],
  );

  const scheduleAudit = useCallback(
    (delay = 32) => {
      if (modeRef.current !== "sample") return;
      if (auditTimerRef.current !== null) window.clearTimeout(auditTimerRef.current);
      auditTimerRef.current = window.setTimeout(() => {
        auditTimerRef.current = null;
        const document = iframeRef.current?.contentDocument;
        if (
          !shouldScheduleSystemAudit({
            committedKey: committedSystemBaselineRef.current,
            readyState: document?.readyState,
            demoStateAttr: document
              ?.querySelector("[data-demo-state]")
              ?.getAttribute("data-demo-state"),
            scopeId: `included:/demo:${viewportRef.current}`,
          })
        ) {
          return;
        }
        runVisibleCommand(auditCurrentScope("system"));
      }, delay);
    },
    [auditCurrentScope, runVisibleCommand],
  );

  useEffect(() => {
    if (iframeRef.current?.contentDocument?.readyState === "complete") scheduleAudit();
  }, [scheduleAudit]);

  useEffect(() => {
    if (didAutoStartRef.current) return;
    if (
      !shouldAutoStartPublicCapture({
        mode: initialMode,
        initialUrl,
        hasCheckpoint: false,
      })
    ) {
      return;
    }
    didAutoStartRef.current = true;
    const seeded = seedApprovedUrl(initialUrl);
    if (!seeded) return;
    const controller = new AbortController();
    captureAbortRef.current = controller;
    runVisibleCommand(capturePublicPage(seeded, viewportRef.current, "human", controller.signal));
    return () => controller.abort();
  }, [capturePublicPage, initialMode, initialUrl, runVisibleCommand]);

  const cancelCapture = useCallback(() => {
    captureAbortRef.current?.abort();
    setCaptureProgress(null);
  }, []);

  const showSample = useCallback(() => {
    beginRemoteOperation();
    resetEvidence();
    modeRef.current = "sample";
    viewportRef.current = "mobile";
    demoStateRef.current = "baseline";
    remoteUrlRef.current = "";
    setMode("sample");
    setViewport("mobile");
    setDemoState("baseline");
    setUrlDraft("");
    setAuditing(true);
    pushActivity(
      "human",
      "Opened included target",
      "Switched to the WebMCP-ready live sample; no remote browser required.",
    );
  }, [beginRemoteOperation, pushActivity, resetEvidence]);

  const changeViewport = useCallback(
    (next: Viewport) => {
      if (next === viewportRef.current) return;
      if (modeRef.current === "remote") {
        runVisibleCommand(
          capturePublicPage(
            remoteUrlRef.current,
            next,
            "human",
            undefined,
            waitForSelectorRef.current,
          ),
        );
        return;
      }
      const previousViewport = viewportRef.current;
      if (demoStateRef.current === "improved")
        invalidateVerification(baselineRef.current[previousViewport]?.findings ?? []);
      viewportRef.current = next;
      setViewport(next);
      selectedRef.current = null;
      setSelectedId(null);
      if (demoStateRef.current === "improved") {
        demoStateRef.current = "baseline";
        previewFindingIdRef.current = null;
        setDemoState("baseline");
        setActivePreviewFindingId(null);
      }
      pushActivity("human", "Changed scope", `Switched the live target to ${next}.`);
      scheduleAudit(80);
    },
    [capturePublicPage, invalidateVerification, pushActivity, runVisibleCommand, scheduleAudit],
  );

  const resetPreview = useCallback(() => {
    demoStateRef.current = "baseline";
    previewCssRef.current = undefined;
    previewFindingIdRef.current = null;
    setDemoState("baseline");
    setActivePreviewFindingId(null);
    verificationRef.current = {};
    setVerification({});
    if (modeRef.current === "remote") {
      const baselineCheckpoint = baselineCheckpointRef.current[viewportRef.current];
      const baselineSnapshot = baselineRef.current[viewportRef.current];
      if (baselineCheckpoint) {
        checkpointRef.current = baselineCheckpoint;
        setCheckpoint(baselineCheckpoint);
      }
      if (baselineSnapshot) {
        currentRef.current = { ...currentRef.current, [viewportRef.current]: baselineSnapshot };
        setCurrentSnapshots(currentRef.current);
      }
      setCssDraft("");
      pushActivity(
        "human",
        "Reset preview",
        "Returned to the original remote checkpoint; the source website was never edited.",
      );
      return;
    }
    pushActivity("human", "Reset preview", "Returned the included target to its baseline state.");
    const baselineSnapshot = baselineRef.current[viewportRef.current];
    currentRef.current = baselineSnapshot
      ? { ...currentRef.current, [viewportRef.current]: baselineSnapshot }
      : currentRef.current;
    setCurrentSnapshots(currentRef.current);
    if (demoState === "baseline") scheduleAudit(0);
  }, [demoState, pushActivity, scheduleAudit]);

  const submitCapture = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      captureAbortRef.current?.abort();
      const controller = new AbortController();
      captureAbortRef.current = controller;
      runVisibleCommand(
        capturePublicPage(
          urlDraft,
          viewportRef.current,
          "human",
          controller.signal,
          waitForSelectorDraft,
        ),
      );
    },
    [capturePublicPage, runVisibleCommand, urlDraft, waitForSelectorDraft],
  );

  const changeUrlDraft = useCallback((value: string) => {
    if (draftApprovalRef.current) {
      approvedUrlsRef.current.delete(draftApprovalRef.current);
      draftApprovalRef.current = null;
    }
    setUrlDraft(value);
    try {
      setDraftApproved(approvedUrlsRef.current.has(canonicalizeApprovedUrl(value)));
    } catch {
      setDraftApproved(false);
    }
  }, []);

  const submitManualJudgment = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      void recordVisualFinding(judgmentDraft, "human")
        .then(() => setJudgmentDraft(EMPTY_JUDGMENT))
        .catch((cause) =>
          setError(
            cause instanceof Error ? cause.message : "Sundae could not record this judgment.",
          ),
        );
    },
    [judgmentDraft, recordVisualFinding],
  );

  const submitCoverageGap = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      void recordCoverageGap(gapDraft.label, gapDraft.detail, "human")
        .then(() => setGapDraft({ label: "", detail: "" }))
        .catch((cause) =>
          setError(
            cause instanceof Error ? cause.message : "Sundae could not record this coverage gap.",
          ),
        );
    },
    [gapDraft, recordCoverageGap],
  );

  const baseline = baselineSnapshots[viewport];
  const current = currentSnapshots[viewport];
  const visibleFindings = useMemo<VisibleFinding[]>(
    () =>
      (baseline?.findings ?? []).map((finding) => ({
        ...finding,
        decision: decisions[finding.id]?.decision ?? "open",
        decisionReason: decisions[finding.id]?.reason ?? "",
        verification: verification[finding.id]?.status ?? "not_run",
        verificationReceipt: verification[finding.id],
      })),
    [baseline, decisions, verification],
  );
  const selected =
    visibleFindings.find((finding) => finding.id === selectedId) ?? visibleFindings[0] ?? null;
  const measuredCount = visibleFindings.filter((finding) => finding.truth === "measured").length;
  const judgedCount = visibleFindings.filter((finding) => finding.truth === "judged").length;
  const evidenceBoard = describeEvidenceBoard(
    baseline,
    current,
    demoState,
    viewport,
    countAgentToolCalls(activity),
  );
  const coverage = deriveCoverageSummary({
    mode,
    baseline,
    current,
    trail: journey,
    baselinesByViewport: baselineSnapshots,
    hasVerification: Boolean(baseline?.findings.some(({ id }) => verification[id] !== undefined)),
  });
  const activeGaps = coverage.openGaps;
  const uncapturedNav = uncapturedVisibleNav(visibleNavRef.current, [
    remoteUrlRef.current,
    ...journey.map((step) => step.displayUrl),
  ]);

  return (
    <WorkbenchView
      mode={mode}
      includedDemoUrl={includedDemoUrl}
      auditGoal={currentAuditGoal}
      viewport={viewport}
      demoState={demoState}
      urlDraft={urlDraft}
      waitForSelectorDraft={waitForSelectorDraft}
      draftApproved={draftApproved}
      cssDraft={cssDraft}
      checkpoint={checkpoint}
      baseline={baseline}
      current={current}
      visibleFindings={visibleFindings}
      selected={selected}
      measuredCount={measuredCount}
      judgedCount={judgedCount}
      auditBrief={auditBrief}
      reviewResults={reviewResults}
      activePreviewFindingId={activePreviewFindingId}
      coverage={coverage}
      evidenceBoard={evidenceBoard}
      activeGaps={activeGaps}
      activity={activity}
      activityLimit={MAX_ACTIVITY_RECEIPTS}
      auditing={auditing}
      error={error}
      journey={journey}
      uncapturedNav={uncapturedNav}
      decisionReason={decisionReason}
      judgmentDraft={judgmentDraft}
      gapDraft={gapDraft}
      iframeRef={iframeRef}
      inspectorRef={inspectorRef}
      commands={commands}
      onAudit={() => runVisibleCommand(auditCurrentScope("human", undefined, waitForSelectorDraft))}
      onResetPreview={resetPreview}
      onInspectAgentSurface={() => runVisibleCommand(inspectAgentSurface("human"))}
      onShowSample={showSample}
      onSubmitCapture={submitCapture}
      onChangeUrlDraft={changeUrlDraft}
      onChangeWaitForSelectorDraft={setWaitForSelectorDraft}
      captureProgress={captureProgress}
      onCancelCapture={cancelCapture}
      onCaptureJourneyStep={(url, label) =>
        runVisibleCommand(captureJourneyStep(url, label, "human", undefined, waitForSelectorDraft))
      }
      onCaptureVisibleNav={() =>
        runVisibleCommand(captureVisibleNav("human", undefined, waitForSelectorDraft))
      }
      onCaptureBelowFold={() => runVisibleCommand(captureBelowFold(waitForSelectorDraft, "human"))}
      onOpenJourneyCheckpoint={openJourneyCheckpoint}
      onChangeViewport={changeViewport}
      onScheduleAudit={() => scheduleAudit()}
      onFocusFinding={(findingId) => runVisibleCommand(focusFinding(findingId, "human"))}
      onSetFindingDecision={(findingId, decision, reason) =>
        runVisibleCommand(setFindingDecisionWithFollowThrough(findingId, decision, reason, "human"))
      }
      onChangeDecisionReason={setDecisionReason}
      onChangeJudgmentDraft={setJudgmentDraft}
      onSubmitManualJudgment={submitManualJudgment}
      onRecordAuditBrief={(input) => runVisibleCommand(recordAuditBrief(input, "human"))}
      onRecordReviewResult={(input) => resolveVisibleCommand(recordReviewResult(input, "human"))}
      onChangeGapDraft={setGapDraft}
      onSubmitCoverageGap={submitCoverageGap}
      onChangeCssDraft={setCssDraft}
      onPreviewFix={(previewCss) =>
        runVisibleCommand(previewFix(previewCss, "human", undefined, waitForSelectorDraft))
      }
      onVerifyRecapture={(findingId) =>
        runVisibleCommand(verifyRecapture(findingId, "human", undefined, waitForSelectorDraft))
      }
    />
  );
}
