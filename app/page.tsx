import { AuditIntentProvider } from "@/components/AuditIntent";
import { AuditLauncher } from "@/components/AuditLauncher";
import { Workbench } from "@/components/Workbench";
import { MAX_AUDIT_GOAL_LENGTH, MAX_PUBLIC_URL_LENGTH, resolvePublicDemoUrl } from "@/lib/launch";
import styles from "./page.module.css";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstBoundedParam(value: string | string[] | undefined, maxLength: number) {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.slice(0, maxLength) ?? "";
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const initialTarget = firstBoundedParam(params.url, MAX_PUBLIC_URL_LENGTH);
  const initialGoal = firstBoundedParam(params.goal, MAX_AUDIT_GOAL_LENGTH);
  const includedDemoUrl = resolvePublicDemoUrl(process.env.SUNDAE_APP_ORIGIN);

  return (
    <AuditIntentProvider initialTarget={initialTarget} initialGoal={initialGoal}>
      <div className={styles.landing} id="top">
        <header className={styles.masthead}>
          <a className={styles.wordmark} href="#top">
            sundae
          </a>
          <nav aria-label="Landing page navigation">
            <a href="#method">WebMCP loop</a>
            <a href="#availability">Contest scope</a>
            <a className={styles.navAction} href="#workbench">
              Open workbench
            </a>
          </nav>
        </header>

        <main aria-label="Sundae product review landing">
          <section className={styles.hero} aria-labelledby="landing-title">
            <div className={styles.heroCopy}>
              <h1 id="landing-title">
                ChatGPT audits the product. Sundae keeps the evidence visible.
              </h1>
              <p>
                Remote MCP opens an exact workspace. WebMCP Site Tools let ChatGPT measure the
                included /demo, read the same board you see, preview a reversible fix, and verify it
                with fresh evidence.
              </p>
              <AuditLauncher includedDemoUrl={includedDemoUrl} />
            </div>

            <div
              className={styles.proofShell}
              role="group"
              aria-label="Illustrative Sundae audit receipt"
            >
              <section className={styles.productStage} aria-label="Included live target example">
                <div className={styles.scopeLine}>
                  <span>
                    <i /> Included WebMCP target
                  </span>
                  <a href="/demo">Open /demo audit</a>
                </div>
                <div className={styles.sampleProduct}>
                  <div className={styles.sampleNav}>
                    <b>Sundae Lab</b>
                    <span>Overview</span>
                    <span>Workflows</span>
                  </div>
                  <div className={styles.sampleHero}>
                    <p>Product operations</p>
                    <h2>
                      Operational intelligence for teams who need visibility across their workflows.
                    </h2>
                    <span>Initialize workspace</span>
                  </div>
                  <div className={styles.sampleRows} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <b className={styles.samplePin}>1</b>
                </div>
              </section>

              <article className={styles.evidenceSheet}>
                <div className={styles.receiptLabel}>
                  <span>Visible Site Tool receipt</span>
                  <code>mobile:tap-target:primary-action</code>
                </div>
                <div className={styles.findingTitle}>
                  <span>Measured · medium</span>
                  <h2>Primary action is difficult to target</h2>
                </div>
                <p className={styles.findingObservation}>
                  The baseline action is 36 CSS px high; the included improvement raises it above
                  the 44 CSS px touch threshold.
                </p>
                <dl className={styles.measurement}>
                  <div>
                    <dt>Observed</dt>
                    <dd>36 px high</dd>
                  </div>
                  <div>
                    <dt>Threshold</dt>
                    <dd>44 px</dd>
                  </div>
                  <div>
                    <dt>Scope</dt>
                    <dd>Mobile</dd>
                  </div>
                </dl>
                <div className={styles.decisionLine}>
                  <span>Human decision</span>
                  <strong>Accepted for preview</strong>
                </div>
                <div className={styles.verificationLine}>
                  <span>Fresh recapture</span>
                  <strong>Verified fixed · 36 px → 48 px</strong>
                </div>
              </article>

              <div className={styles.ledgerLine} aria-hidden="true">
                <div className={styles.ledgerFill}>
                  <span />
                  <span />
                </div>
              </div>
            </div>
          </section>

          <section className={styles.method} id="method" aria-labelledby="method-title">
            <div className={styles.methodIntro}>
              <h2 id="method-title">ChatGPT and the human share one audit board.</h2>
              <p>
                The remote tool prepares the workspace; page-scoped Site Tools let ChatGPT critique
                visible UI, UX, and Interaction for the product&apos;s job, update the same board as
                human controls, and keep what was not seen there as coverage gaps with receipts.
              </p>
            </div>
            <ol className={styles.methodSteps}>
              <li>
                <strong>Prepare the exact workspace</strong>
                <span>
                  `start_audit` preserves the target and goal. `workspace_ready` never means capture
                  completed.
                </span>
              </li>
              <li>
                <strong>Wait, then audit /demo</strong>
                <span>
                  The workbench around the included target exposes nine Site Tools and needs no
                  browser-provider or model key.
                </span>
              </li>
              <li>
                <strong>Read before deciding</strong>
                <span>
                  Board context keeps measured facts, judged opinions, decisions, and unseen
                  coverage separate.
                </span>
              </li>
              <li>
                <strong>Preview, then verify</strong>
                <span>
                  The preview is reversible; only a fresh same-scope recapture can verify a measured
                  fix.
                </span>
              </li>
            </ol>
          </section>

          <section
            className={styles.availability}
            id="availability"
            aria-labelledby="availability-title"
          >
            <div className={styles.availabilityIntro}>
              <h2 id="availability-title">The contest path runs without provider keys.</h2>
              <p>
                Judges can run the complete WebMCP loop on /demo. Public Cloudflare capture remains
                secondary and reports honestly when it is not configured.
              </p>
            </div>
            <div className={styles.capabilityLedger}>
              <article className={styles.capabilityBand}>
                <div>
                  <span className={styles.availableLabel}>
                    <i /> Available now
                  </span>
                  <h3>ChatGPT operating Sundae through WebMCP</h3>
                </div>
                <ul>
                  <li>Read-only `start_audit` handoff with an exact workspace URL</li>
                  <li>Visible workbench with nine Site Tools for the included /demo</li>
                  <li>One visible board for ChatGPT actions and human controls</li>
                  <li>Measured, judged, and not-seen evidence kept distinct</li>
                  <li>Reversible preview followed by fresh recapture verification</li>
                  <li>Attributed receipts after every successful agent action</li>
                </ul>
              </article>
              <article className={styles.capabilityBand}>
                <div>
                  <span className={styles.comingSoonLabel}>Not claimed</span>
                  <h3>Deliberately outside this contest build</h3>
                </div>
                <ul>
                  <li>Private or login-only product capture</li>
                  <li>Source-code, deployment, or design-file changes</li>
                  <li>Persistent accounts or shareable saved workspaces</li>
                  <li>Cross-provider browser and connector parity</li>
                </ul>
              </article>
            </div>
          </section>

          <section className={styles.handoff} aria-labelledby="handoff-title">
            <div>
              <h2 id="handoff-title">Remote MCP opens the door. WebMCP does the work.</h2>
              <p>
                `start_audit` returns `workspace_ready` and stops. ChatGPT opens the page, waits for
                Sundae Site Tools, audits the approved scope, reads the board, and leaves each
                action visible. If the tools never appear, the exact workspace link remains—and the
                audit is not reported as complete.
              </p>
            </div>
            <a href="#launch">Run the /demo handoff</a>
          </section>
        </main>
      </div>
      <Workbench
        initialUrl={initialTarget}
        auditGoal={initialGoal}
        includedDemoUrl={includedDemoUrl}
      />
    </AuditIntentProvider>
  );
}
