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
            <a href="#method">Why WebMCP</a>
            <a href="#availability">How it works</a>
            <a className={styles.navAction} href="#workbench">
              Open workbench
            </a>
          </nav>
        </header>

        <main aria-label="Sundae product review landing">
          <section className={styles.hero} aria-labelledby="landing-title">
            <div className={styles.heroCopy}>
              <h1 id="landing-title">Audit the same live page together.</h1>
              <p>
                Ordinary AI audits split the interface, conversation, evidence, and decisions.
                Sundae makes the live page the shared WebMCP workspace: ChatGPT measures and
                organizes evidence, you govern judgment, and fresh recapture verifies every claimed
                fix.
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
                  <strong>Required before “fixed”</strong>
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
              <h2 id="method-title">WebMCP keeps the work inspectable.</h2>
              <p>
                A person and their ChatGPT agent audit the same live page together: the agent
                measures and organizes evidence through WebMCP, the person governs judgment, and
                Sundae verifies every claimed fix.
              </p>
            </div>
            <ol className={styles.methodSteps}>
              <li>
                <strong>Open one shared page</strong>
                <span>
                  ChatGPT Desktop discovers Sundae&apos;s page-hosted Site Tools automatically. No
                  separate connection is needed.
                </span>
              </li>
              <li>
                <strong>Measure before judging</strong>
                <span>
                  ChatGPT measures the approved scope, reads the board, then critiques visible UI,
                  UX, and Interaction for the product&apos;s job.
                </span>
              </li>
              <li>
                <strong>Keep authority visible</strong>
                <span>
                  Facts, supported opinions, gaps, decisions, previews, and receipts remain distinct
                  on the board the person controls.
                </span>
              </li>
              <li>
                <strong>Require fresh proof</strong>
                <span>
                  A preview is reversible and never counts as fixed. Only a matching recapture can
                  verify a measured change.
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
                The included /demo is a complete eleven-tool audit workspace. A public URL adds four
                bounded capture tools when the configured browser provider can render it.
              </p>
            </div>
            <div className={styles.capabilityLedger}>
              <article className={styles.capabilityBand}>
                <div>
                  <span className={styles.availableLabel}>
                    <i /> Available now
                  </span>
                  <h3>One visible board for agent and person</h3>
                </div>
                <ul>
                  <li>Eleven page-hosted tools for the included /demo</li>
                  <li>Fifteen tools for an approved public capture workspace</li>
                  <li>The same command path for ChatGPT actions and human controls</li>
                  <li>Measured, judged, and not-seen evidence kept distinct</li>
                  <li>Reversible preview followed by fresh recapture verification</li>
                  <li>Tool-named receipts tied to visible board changes</li>
                </ul>
              </article>
              <article className={styles.capabilityBand}>
                <div>
                  <span className={styles.comingSoonLabel}>Bounded honestly</span>
                  <h3>What Sundae does not pretend to see</h3>
                </div>
                <ul>
                  <li>Pages that require login or target-site cookies</li>
                  <li>Routes not visible in evidence or named by the person</li>
                  <li>Click-only states without an approved public URL</li>
                  <li>Sites the configured browser provider cannot render</li>
                </ul>
              </article>
            </div>
          </section>

          <section className={styles.handoff} aria-labelledby="handoff-title">
            <div>
              <h2 id="handoff-title">Open the shared page in ChatGPT Desktop.</h2>
              <p>
                Copy the exact workspace URL, open ChatGPT Desktop&apos;s built-in browser, and
                paste it there. Site Tools appear from the page itself. If they do not appear, the
                human controls still work and Sundae does not claim an agent audit happened.
              </p>
            </div>
            <a href="#launch">Prepare the exact workspace</a>
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
