"use client";

import { type FormEvent, useState } from "react";

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
  initialTarget?: string;
  initialGoal?: string;
};

type HandoffReceipt = {
  prompt: string;
  workspaceUrl: string;
  copied: boolean;
};

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "Sundae could not prepare this audit.";
}

export function AuditLauncher({ initialTarget = "", initialGoal = "" }: AuditLauncherProps) {
  const [targetUrl, setTargetUrl] = useState(initialTarget);
  const [goal, setGoal] = useState(initialGoal);
  const [error, setError] = useState("");
  const [handoff, setHandoff] = useState<HandoffReceipt | null>(null);

  function prepareLaunch() {
    const launch = createAuditLaunch(targetUrl, goal);
    return {
      launch,
      workspaceUrl: buildWorkspaceUrl(window.location.origin, launch),
    };
  }

  function startInSundae(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setHandoff(null);
    try {
      window.location.assign(prepareLaunch().workspaceUrl);
    } catch (cause) {
      setError(errorMessage(cause));
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

  function continueInChatGpt() {
    setError("");
    try {
      const { launch, workspaceUrl } = prepareLaunch();
      const prompt = buildChatGptHandoffPrompt(launch, workspaceUrl);
      const receipt = { prompt, workspaceUrl, copied: false };
      setHandoff(receipt);
      window.open(CHATGPT_HOME_URL, "_blank", "noopener,noreferrer");
      copyHandoff(receipt);
    } catch (cause) {
      setError(errorMessage(cause));
      setHandoff(null);
    }
  }

  return (
    <form
      className={styles.launcher}
      id="launch"
      aria-label="Start a Sundae audit"
      onSubmit={startInSundae}
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
            placeholder="Activation, visual polish, signup clarity…"
          />
        </label>
      </div>

      <div className={styles.actions}>
        <button className={styles.primaryAction} type="submit">
          <Icon name="focus" /> Start audit
        </button>
        <button className={styles.chatGptAction} type="button" onClick={continueInChatGpt}>
          <Icon name="agent" /> Continue in ChatGPT
        </button>
      </div>

      <p className={styles.controlNote}>
        Starting here prefills the workbench without spending capture time. Continuing copies a
        ready request and opens ChatGPT.
      </p>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {handoff ? (
        <section className={styles.receipt} aria-live="polite" aria-label="ChatGPT handoff ready">
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
