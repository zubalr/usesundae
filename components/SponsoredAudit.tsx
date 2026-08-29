"use client";

import Script from "next/script";
import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { useAuditIntent } from "@/components/AuditIntent";
import { Icon } from "@/components/Icons";
import type { Viewport } from "@/lib/audit/types";
import { createAuditLaunch } from "@/lib/launch";
import type { SponsoredAuditPublicConfig } from "@/lib/sponsored/config";
import {
  sponsoredAuditFailureSchema,
  sponsoredAuditSuccessSchema,
  type SponsoredAuditSuccess,
} from "@/lib/sponsored/public-schema";
import styles from "./SponsoredAudit.module.css";

type SponsoredFinding = SponsoredAuditSuccess["snapshot"]["findings"][number];
type SponsoredCheckpoint = SponsoredAuditSuccess["checkpoint"];

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "Sundae could not complete this review.";
}

function findingLabel(finding: SponsoredFinding) {
  return `${finding.truth === "measured" ? "Measured" : "Design judgment"} · ${finding.severity}`;
}

function regionStyle(
  finding: SponsoredFinding,
  checkpoint: SponsoredCheckpoint,
): CSSProperties | undefined {
  if (!finding.rect) return undefined;
  const { x, y, width, height } = finding.rect;
  return {
    left: `${(x / checkpoint.viewportSize.width) * 100}%`,
    top: `${(y / checkpoint.viewportSize.height) * 100}%`,
    width: `${(width / checkpoint.viewportSize.width) * 100}%`,
    height: `${(height / checkpoint.viewportSize.height) * 100}%`,
  };
}

function AuditReport({ result }: { result: SponsoredAuditSuccess }) {
  const visibleFindings = useMemo(
    () => result.snapshot.findings.filter((finding) => finding.rect),
    [result.snapshot.findings],
  );
  return (
    <article
      className={styles.report}
      id="sponsored-result"
      aria-labelledby="sponsored-result-title"
    >
      <header className={styles.reportHeader}>
        <div>
          <span className={styles.successLabel}>
            <i /> Review complete
          </span>
          <h3 id="sponsored-result-title">{result.checkpoint.title}</h3>
          <a href={result.checkpoint.target.displayUrl} target="_blank" rel="noreferrer">
            {result.checkpoint.target.displayUrl}
          </a>
        </div>
        <dl>
          <div>
            <dt>Viewport</dt>
            <dd>{result.checkpoint.viewport}</dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd>{result.snapshot.findings.length} findings</dd>
          </div>
          <div>
            <dt>Captured</dt>
            <dd>{new Date(result.checkpoint.capturedAt).toLocaleTimeString()}</dd>
          </div>
        </dl>
      </header>

      <div className={styles.reportLead}>
        <p>{result.summary}</p>
        <div>
          <span>This result stays in this tab. It is not published as a public audit page.</span>
          <a href="#workbench">Continue in the evidence workbench</a>
        </div>
      </div>

      <div className={styles.evidenceLayout}>
        <figure className={styles.screenshotFigure}>
          <div className={styles.screenshotViewport}>
            {/* The image is a trusted data URL returned by Sundae's bounded capture endpoint. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.checkpoint.screenshotDataUrl}
              alt={`Captured ${result.checkpoint.viewport} view of ${result.checkpoint.title}`}
            />
            {visibleFindings.map((finding, index) => (
              <span
                className={styles.evidenceRegion}
                style={regionStyle(finding, result.checkpoint)}
                key={finding.id}
                aria-hidden="true"
              >
                <b>{index + 1}</b>
              </span>
            ))}
          </div>
          <figcaption>
            Full-page screenshot · numbered regions identify screenshot-backed judgments
          </figcaption>
        </figure>

        <div className={styles.findingLedger}>
          {result.snapshot.findings.length ? (
            <ol>
              {result.snapshot.findings.map((finding) => {
                const regionIndex = visibleFindings.findIndex((item) => item.id === finding.id);
                return (
                  <li key={finding.id}>
                    <div className={styles.findingMeta}>
                      <span>{findingLabel(finding)}</span>
                      {regionIndex >= 0 ? <b>Region {regionIndex + 1}</b> : null}
                    </div>
                    <h4>{finding.title}</h4>
                    <p>{finding.observation}</p>
                    {finding.measurement ? (
                      <dl className={styles.findingMeasurement}>
                        <div>
                          <dt>Observed</dt>
                          <dd>{finding.measurement.value}</dd>
                        </div>
                        <div>
                          <dt>Reference</dt>
                          <dd>{finding.measurement.threshold}</dd>
                        </div>
                      </dl>
                    ) : null}
                    <p>
                      <strong>Why it matters</strong>
                      {finding.whyItMatters}
                    </p>
                    <p>
                      <strong>Try next</strong>
                      {finding.recommendation}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className={styles.emptyFinding}>
              No consequential issue was supported by this captured evidence. That is not a review
              of unseen routes or states.
            </p>
          )}
        </div>
      </div>

      <div className={styles.reportFoot}>
        <section>
          <h4>What already works</h4>
          {result.strengths.length ? (
            <ul>
              {result.strengths.map((strength) => (
                <li key={`${strength.title}:${strength.evidence}`}>
                  <strong>{strength.title}</strong>
                  <span>{strength.evidence}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No strength was specific enough to record from this checkpoint.</p>
          )}
        </section>
        <section>
          <h4>What was not reviewed</h4>
          <ul>
            {[...result.coverage_notes, ...result.checkpoint.gaps.map((gap) => gap.detail)].map(
              (note) => (
                <li key={note}>{note}</li>
              ),
            )}
          </ul>
        </section>
        <section className={styles.providerReceipt}>
          <h4>Provider receipt</h4>
          <dl>
            <div>
              <dt>Capture</dt>
              <dd>Cloudflare Browser Rendering</dd>
            </div>
            <div>
              <dt>Review</dt>
              <dd>
                {result.receipt.provider} · {result.receipt.model}
              </dd>
            </div>
            <div>
              <dt>Reasoning</dt>
              <dd>{result.receipt.thinking_level}</dd>
            </div>
            <div>
              <dt>Scope</dt>
              <dd>{result.receipt.scope}</dd>
            </div>
          </dl>
        </section>
      </div>
    </article>
  );
}

export function SponsoredAudit({ config }: { config: SponsoredAuditPublicConfig }) {
  const { targetUrl, goal, setSponsoredResult } = useAuditIntent();
  const widgetContainer = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [consent, setConsent] = useState(false);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SponsoredAuditSuccess | null>(null);

  useEffect(() => {
    if (window.turnstile) setScriptReady(true);
  }, []);

  useEffect(() => {
    if (!config.available || !scriptReady || !widgetContainer.current || !window.turnstile) return;
    if (widgetId.current) return;
    const api = window.turnstile;
    widgetId.current = api.render(widgetContainer.current, {
      sitekey: config.turnstileSiteKey,
      theme: "auto",
      callback: setChallengeToken,
      "expired-callback": () => setChallengeToken(""),
      "error-callback": () => setChallengeToken(""),
    });
    return () => {
      if (widgetId.current) api.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [config, result, scriptReady]);

  function resetChallenge() {
    setChallengeToken("");
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }

  async function runSponsoredAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    if (!config.available) return;
    try {
      const launch = createAuditLaunch(targetUrl, goal);
      if (!consent) throw new Error("Approve the evidence transfer before starting the review.");
      if (!challengeToken) throw new Error("Complete the human verification before starting.");
      setSubmitting(true);
      const response = await fetch("/api/sponsored-audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: launch.targetUrl,
          goal: launch.goal,
          viewport,
          consent: true,
          turnstile_token: challengeToken,
        }),
        credentials: "same-origin",
        cache: "no-store",
      });
      const rawPayload = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = sponsoredAuditFailureSchema.safeParse(rawPayload);
        throw new Error(
          failure.success && failure.data.message
            ? failure.data.message
            : "Sundae could not complete this review. Try again.",
        );
      }
      const payload = sponsoredAuditSuccessSchema.safeParse(rawPayload);
      if (!payload.success) {
        throw new Error("Sundae received an invalid audit report. Your browser was not updated.");
      }
      setResult(payload.data);
      setSponsoredResult(payload.data);
      requestAnimationFrame(() =>
        document.getElementById("sponsored-result")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    } catch (cause) {
      setError(errorMessage(cause));
      resetChallenge();
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.section} id="sponsored-audit" aria-labelledby="sponsored-title">
      {config.available ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setScriptReady(true)}
        />
      ) : null}
      <div className={styles.intro}>
        <h2 id="sponsored-title">One complete review, on Sundae.</h2>
        <p>
          No compatible AI plan yet? Sundae can sponsor one full-page review of a public page,
          including the screenshot, accessibility evidence, strengths, prioritized problems, and
          honest coverage gaps.
        </p>
        <dl>
          <div>
            <dt>Scope</dt>
            <dd>One public page · one viewport</dd>
          </div>
          <div>
            <dt>Privacy</dt>
            <dd>Not published or saved as a public report</dd>
          </div>
          <div>
            <dt>Limit</dt>
            <dd>One success per browser/network · subject to global capacity</dd>
          </div>
        </dl>
      </div>

      {config.available ? (
        <form className={styles.auditForm} onSubmit={runSponsoredAudit} aria-busy={submitting}>
          <div className={styles.targetReceipt}>
            <span>Prepared target</span>
            <code>{targetUrl.trim() || "Enter a public URL above"}</code>
          </div>
          {result ? (
            <div className={styles.completedReceipt} role="status">
              <Icon name="check" />
              <div>
                <strong>Complimentary review used</strong>
                <span>
                  A signed browser receipt was issued. This result remains visible until you leave
                  or refresh this tab.
                </span>
              </div>
            </div>
          ) : (
            <>
              <fieldset className={styles.viewportChoice}>
                <legend>Review viewport</legend>
                <label>
                  <input
                    type="radio"
                    name="sponsored-viewport"
                    value="desktop"
                    checked={viewport === "desktop"}
                    onChange={() => setViewport("desktop")}
                  />
                  <Icon name="desktop" /> Desktop
                </label>
                <label>
                  <input
                    type="radio"
                    name="sponsored-viewport"
                    value="mobile"
                    checked={viewport === "mobile"}
                    onChange={() => setViewport("mobile")}
                  />
                  <Icon name="mobile" /> Mobile
                </label>
              </fieldset>
              <label className={styles.consent}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>
                  I am allowed to review this public page and approve sending its screenshot,
                  rendered text, and accessibility summary to Cloudflare Browser Rendering and the
                  Google Gemini Developer API.
                </span>
              </label>
              <div className={styles.challenge} ref={widgetContainer} />
              <button
                className={styles.submit}
                type="submit"
                disabled={submitting || !consent || !challengeToken || !targetUrl.trim()}
              >
                <Icon name={submitting ? "refresh" : "spark"} />
                {submitting
                  ? "Verifying, capturing, and reviewing…"
                  : "Run my complimentary review"}
              </button>
              <p className={styles.formNote}>
                Sundae records only a one-way browser/network redemption fingerprint in Cloudflare
                Durable Objects. It does not store your raw address in the audit record.
              </p>
            </>
          )}
          {error ? (
            <p className={styles.error} role="alert" tabIndex={-1} ref={errorRef}>
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <div className={styles.unavailable}>
          <span>Coming soon</span>
          <h3>The guarded complimentary route is being connected.</h3>
          <p>
            The ChatGPT route and evidence workbench remain available now. Sundae will open this
            route when capture, human verification, and the complimentary review allowance can be
            enforced safely.
          </p>
          <a href="#launch">Use the available routes</a>
        </div>
      )}

      {result ? <AuditReport result={result} /> : null}
    </section>
  );
}
