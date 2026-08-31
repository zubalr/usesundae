"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { useAuditIntent } from "@/components/AuditIntent";
import { Icon } from "@/components/Icons";
import {
  buildChatGptHandoffPrompt,
  buildWorkspaceUrl,
  createAuditLaunch,
  MAX_AUDIT_GOAL_LENGTH,
  MAX_PUBLIC_URL_LENGTH,
} from "@/lib/launch";
import styles from "./AuditLauncher.module.css";

type HandoffReceipt = {
  prompt: string;
  workspaceUrl: string;
  copied: boolean;
};

type ToolReadiness = { state: "checking" } | { state: "human" } | { state: "available" };

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "Sundae could not prepare this audit.";
}

function revealFeedback(target: { current: HTMLElement | null }) {
  requestAnimationFrame(() => target.current?.focus());
}

function copyWorkspaceUrl(receipt: HandoffReceipt) {
  void navigator.clipboard?.writeText(receipt.workspaceUrl);
}

export function AuditLauncher({ includedDemoUrl }: { includedDemoUrl: string }) {
  const { targetUrl, setTargetUrl, goal, setGoal } = useAuditIntent();
  const [error, setError] = useState("");
  const [handoff, setHandoff] = useState<HandoffReceipt | null>(null);
  const [toolReadiness, setToolReadiness] = useState<ToolReadiness>({ state: "checking" });
  const errorRef = useRef<HTMLParagraphElement>(null);
  const handoffRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setToolReadiness(
      document.modelContext?.registerTool ? { state: "available" } : { state: "human" },
    );
  }, []);

  function prepareLaunch(useDemo: boolean) {
    const launch = createAuditLaunch(useDemo ? includedDemoUrl : targetUrl, goal);
    return {
      launch,
      workspaceUrl: buildWorkspaceUrl(window.location.origin, launch),
    };
  }

  function openPublicWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setHandoff(null);
    try {
      window.location.assign(prepareLaunch(false).workspaceUrl);
    } catch (cause) {
      setError(errorMessage(cause));
      revealFeedback(errorRef);
    }
  }

  function prepareChatGptHandoff() {
    setError("");
    setHandoff(null);
    try {
      const { launch, workspaceUrl } = prepareLaunch(!targetUrl.trim());
      const prompt = buildChatGptHandoffPrompt(launch, workspaceUrl, includedDemoUrl);
      const receipt = { prompt, workspaceUrl, copied: false };
      setHandoff(receipt);
      revealFeedback(handoffRef);
      copyHandoff(receipt);
    } catch (cause) {
      setError(errorMessage(cause));
      setHandoff(null);
      revealFeedback(errorRef);
    }
  }

  function copyHandoff(receipt: HandoffReceipt) {
    const copyOperation = navigator.clipboard?.writeText(receipt.prompt);
    if (!copyOperation) {
      setHandoff(receipt);
      return;
    }
    void copyOperation
      .then(() => setHandoff({ ...receipt, copied: true }))
      .catch(() => setHandoff(receipt));
  }

  return (
    <form
      className={styles.launcher}
      id="launch"
      aria-label="Start a Sundae audit"
      onSubmit={openPublicWorkspace}
      noValidate
    >
      <div className={styles.fields}>
        <label className={styles.urlField}>
          <span>Public page</span>
          <input
            type="text"
            inputMode="url"
            value={targetUrl}
            maxLength={MAX_PUBLIC_URL_LENGTH}
            onChange={(event) => setTargetUrl(event.target.value)}
            placeholder="linear.app"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <label className={styles.goalField}>
          <span>
            Audit focus <small>Optional</small>
          </span>
          <input
            type="text"
            value={goal}
            maxLength={MAX_AUDIT_GOAL_LENGTH}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="Activation, pricing, visual hierarchy…"
          />
        </label>
      </div>

      {error ? (
        <p className={styles.error} role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <a className={styles.demoAction} href="/demo">
          <Icon name="focus" /> Run included /demo
        </a>
        <button className={styles.workbenchAction} type="submit">
          Open public workspace
        </button>
        <button className={styles.desktopAction} type="button" onClick={prepareChatGptHandoff}>
          <Icon name="agent" /> Prepare Desktop handoff
        </button>
      </div>

      <p className={styles.controlNote} data-state={toolReadiness.state}>
        <i aria-hidden="true" />
        {toolReadiness.state === "available"
          ? "Site Tools supported here. Open a workspace to register its page tools."
          : toolReadiness.state === "human"
            ? "Human controls ready. For Site Tools, open the exact workspace in ChatGPT Desktop’s built-in browser."
            : "Checking this browser for Site Tools…"}
      </p>

      {handoff ? (
        <section
          className={styles.receipt}
          aria-live="polite"
          aria-label="ChatGPT handoff ready"
          tabIndex={-1}
          ref={handoffRef}
        >
          <div className={styles.receiptStatus}>
            <span>
              <i data-copied={handoff.copied} /> ChatGPT Desktop handoff
            </span>
            <strong>{handoff.copied ? "Request copied" : "Request ready to copy"}</strong>
          </div>
          <p>
            No plugin or connection is required. In ChatGPT Desktop, open the built-in browser and
            paste the exact workspace URL below. Site Tools are discovered automatically there; an
            ordinary browser cannot force that internal browser to open.
          </p>
          <textarea
            readOnly
            value={handoff.prompt}
            aria-label="Ready-to-send Sundae request"
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className={styles.receiptLinks}>
            <button type="button" onClick={() => copyHandoff(handoff)}>
              Copy request
            </button>
            <button type="button" onClick={() => copyWorkspaceUrl(handoff)}>
              Copy workspace URL
            </button>
            <a href={handoff.workspaceUrl}>Open exact workspace</a>
          </div>
        </section>
      ) : null}
    </form>
  );
}
