"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { useAuditIntent } from "@/components/AuditIntent";
import { Icon } from "@/components/Icons";
import {
  buildChatGptComposerUrl,
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

function usePreparedLaunch(includedDemoUrl: string) {
  const { targetUrl, goal } = useAuditIntent();
  return (useDemo: boolean) => {
    const launch = createAuditLaunch(useDemo ? includedDemoUrl : targetUrl, goal);
    return {
      launch,
      workspaceUrl: buildWorkspaceUrl(window.location.origin, launch),
    };
  };
}

export function AuditLauncher({ includedDemoUrl }: { includedDemoUrl: string }) {
  const { targetUrl, setTargetUrl, goal, setGoal } = useAuditIntent();
  const [error, setError] = useState("");
  const [toolReadiness, setToolReadiness] = useState<ToolReadiness>({ state: "checking" });
  const errorRef = useRef<HTMLParagraphElement>(null);
  const prepareLaunch = usePreparedLaunch(includedDemoUrl);

  useEffect(() => {
    setToolReadiness(
      document.modelContext?.registerTool ? { state: "available" } : { state: "human" },
    );
  }, []);

  function openPublicWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      window.location.assign(prepareLaunch(false).workspaceUrl);
    } catch (cause) {
      setError(errorMessage(cause));
      revealFeedback(errorRef);
    }
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
        <button className={styles.workbenchAction} type="submit">
          Audit my page
        </button>
      </div>

      <p className={styles.demoHint}>
        <a className={styles.demoAction} href="/demo">
          No URL handy? Try it on our sample product.
        </a>
      </p>

      <p className={styles.controlNote} data-state={toolReadiness.state}>
        <i aria-hidden="true" />
        {toolReadiness.state === "available"
          ? "This browser can run the audit with your ChatGPT. Type a public URL and press Enter."
          : toolReadiness.state === "human"
            ? "Type a public URL and press Enter. Sundae captures the live page and shows what it measured. Nothing changes until you say so."
            : "Checking this browser…"}
      </p>
    </form>
  );
}

export function ChatGptNextStep({ includedDemoUrl }: { includedDemoUrl: string }) {
  const { targetUrl } = useAuditIntent();
  const [error, setError] = useState("");
  const [handoff, setHandoff] = useState<HandoffReceipt | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const handoffRef = useRef<HTMLElement>(null);
  const prepareLaunch = usePreparedLaunch(includedDemoUrl);

  function openChatGptAudit() {
    setError("");
    setHandoff(null);
    try {
      const { launch, workspaceUrl } = prepareLaunch(!targetUrl.trim());
      const prompt = buildChatGptHandoffPrompt(launch, workspaceUrl, includedDemoUrl);
      const receipt = { prompt, workspaceUrl, copied: false };
      setHandoff(receipt);
      window.open(buildChatGptComposerUrl(prompt), "_blank", "noopener,noreferrer");
      revealFeedback(handoffRef);
    } catch (cause) {
      setError(errorMessage(cause));
      setHandoff(null);
      revealFeedback(errorRef);
    }
  }

  function copyWorkspaceLink(receipt: HandoffReceipt) {
    const copyOperation = navigator.clipboard?.writeText(receipt.workspaceUrl);
    if (!copyOperation) {
      setHandoff(receipt);
      return;
    }
    void copyOperation
      .then(() => setHandoff({ ...receipt, copied: true }))
      .catch(() => setHandoff(receipt));
  }

  return (
    <div className={styles.nextStep}>
      <button className={styles.desktopAction} type="button" onClick={openChatGptAudit}>
        <Icon name="agent" /> Audit with ChatGPT
      </button>
      <p>
        Continue in ChatGPT Desktop&apos;s built-in browser or ChatGPT Work Cloud after the capture.
        Site Tools appear on the open workspace.
      </p>
      {error ? (
        <p className={styles.error} role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      ) : null}
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
              <i data-copied={handoff.copied} /> ChatGPT handoff
            </span>
            <strong>
              {handoff.copied ? "Workspace link copied" : "Opened ChatGPT with this audit"}
            </strong>
          </div>
          <p>
            ChatGPT should already have the audit instruction typed. Keep a copy of the exact
            workspace URL if you want to paste it into Desktop’s built-in browser yourself.
          </p>
          <div className={styles.receiptLinks}>
            <button type="button" onClick={() => copyWorkspaceLink(handoff)}>
              Copy workspace URL
            </button>
            <a href={handoff.workspaceUrl}>Open exact workspace</a>
          </div>
        </section>
      ) : null}
    </div>
  );
}
