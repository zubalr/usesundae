"use client";

import { type FormEvent, useRef, useState } from "react";

import { useAuditIntent } from "@/components/AuditIntent";
import { Icon } from "@/components/Icons";
import {
  buildChatGptHandoffPrompt,
  buildWorkspaceUrl,
  CHATGPT_HOME_URL,
  createAuditLaunch,
  MAX_AUDIT_GOAL_LENGTH,
  MAX_PUBLIC_URL_LENGTH,
} from "@/lib/launch";
import styles from "./AuditLauncher.module.css";

type AuditLauncherProps = {
  sponsoredAvailable: boolean;
};

type HandoffReceipt = {
  prompt: string;
  workspaceUrl: string;
  copied: boolean;
};

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "Sundae could not prepare this audit.";
}

function revealFeedback(target: { current: HTMLElement | null }) {
  requestAnimationFrame(() => target.current?.focus());
}

export function AuditLauncher({ sponsoredAvailable }: AuditLauncherProps) {
  const { targetUrl, setTargetUrl, goal, setGoal } = useAuditIntent();
  const [error, setError] = useState("");
  const [handoff, setHandoff] = useState<HandoffReceipt | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const handoffRef = useRef<HTMLElement>(null);

  function prepareLaunch() {
    const launch = createAuditLaunch(targetUrl, goal);
    return {
      launch,
      workspaceUrl: buildWorkspaceUrl(window.location.origin, launch),
    };
  }

  function openWorkbench() {
    setError("");
    setHandoff(null);
    try {
      window.location.assign(prepareLaunch().workspaceUrl);
    } catch (cause) {
      setError(errorMessage(cause));
      revealFeedback(errorRef);
    }
  }

  function openSponsoredAudit() {
    setError("");
    setHandoff(null);
    try {
      prepareLaunch();
      document.getElementById("sponsored-audit")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } catch (cause) {
      setError(errorMessage(cause));
      revealFeedback(errorRef);
    }
  }

  function continueInChatGpt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setHandoff(null);
    try {
      const { launch, workspaceUrl } = prepareLaunch();
      const prompt = buildChatGptHandoffPrompt(launch, workspaceUrl);
      const receipt = { prompt, workspaceUrl, copied: false };
      setHandoff(receipt);
      revealFeedback(handoffRef);
      window.open(CHATGPT_HOME_URL, "_blank", "noopener,noreferrer");
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
      onSubmit={continueInChatGpt}
      noValidate
    >
      <div className={styles.fields}>
        <label className={styles.urlField}>
          <span>Public product URL</span>
          <input
            type="url"
            value={targetUrl}
            maxLength={MAX_PUBLIC_URL_LENGTH}
            onChange={(event) => setTargetUrl(event.target.value)}
            placeholder="https://your-product.com"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            required
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
            placeholder="Activation, signup clarity, visual polish…"
          />
        </label>
      </div>

      {error ? (
        <p className={styles.error} role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <button className={styles.chatGptAction} type="submit">
          <Icon name="agent" /> Continue with ChatGPT
        </button>
        <button className={styles.workbenchAction} type="button" onClick={openWorkbench}>
          <Icon name="focus" /> Open evidence workbench
        </button>
        {sponsoredAvailable ? (
          <button className={styles.sponsoredAction} type="button" onClick={openSponsoredAudit}>
            <Icon name="spark" /> Use one complimentary review
          </button>
        ) : null}
      </div>

      <p className={styles.controlNote}>
        ChatGPT uses your connected plan. The workbench is the transparent fallback: capture,
        findings, decisions, and fresh verification stay visibly separate.
      </p>
      {!sponsoredAvailable ? (
        <p className={styles.comingSoon}>Complimentary full-page review · coming soon</p>
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
            <strong>{handoff.copied ? "Request copied" : "Request ready to copy"}</strong>
          </div>
          <p>
            Paste this into ChatGPT. If automatic copy was blocked, use Copy request or select the
            text. The exact workspace remains available either way.
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
            <a href={CHATGPT_HOME_URL} target="_blank" rel="noreferrer">
              Open ChatGPT
            </a>
            <a href={handoff.workspaceUrl}>Open exact workspace</a>
          </div>
        </section>
      ) : null}
    </form>
  );
}
