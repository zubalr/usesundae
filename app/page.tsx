import { AuditLauncher } from "@/components/AuditLauncher";
import { Workbench } from "@/components/Workbench";
import { MAX_AUDIT_GOAL_LENGTH, MAX_PUBLIC_URL_LENGTH } from "@/lib/launch";
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

  return (
    <>
      <div className={styles.landing} id="top">
        <header className={styles.masthead}>
          <a className={styles.wordmark} href="#top">
            sundae
          </a>
          <nav aria-label="Landing page navigation">
            <a href="#method">Method</a>
            <a href="#availability">What ships</a>
            <a className={styles.navAction} href="#workbench">
              Open workbench
            </a>
          </nav>
        </header>

        <main>
          <section className={styles.hero} aria-labelledby="landing-title">
            <div className={styles.heroCopy}>
              <h1 id="landing-title">See what keeps a good product from feeling great.</h1>
              <p>
                Paste a public URL. Sundae and ChatGPT review the same UI and UX evidence,
                prioritize the strongest problems, preview a bounded improvement, and verify what
                changed.
              </p>
              <AuditLauncher initialTarget={initialTarget} initialGoal={initialGoal} />
            </div>

            <div className={styles.proofShell} aria-label="Illustrative Sundae audit receipt">
              <section className={styles.productStage} aria-label="Included live target example">
                <div className={styles.scopeLine}>
                  <span>
                    <i /> Included live target
                  </span>
                  <code>/demo · mobile · baseline</code>
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
                  <span>Illustrative included audit</span>
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
              <h2 id="method-title">A polished opinion is not proof.</h2>
              <p>
                Sundae keeps browser facts, product judgment, missing coverage, human decisions, and
                fresh verification visibly separate.
              </p>
            </div>
            <ol className={styles.methodSteps}>
              <li>
                <strong>Capture approved scope</strong>
                <span>
                  Start with the included target or an explicit public URL. Nothing crawls silently.
                </span>
              </li>
              <li>
                <strong>Review with evidence</strong>
                <span>
                  Measured findings carry values; design judgments point to what was actually seen.
                </span>
              </li>
              <li>
                <strong>Decide and preview</strong>
                <span>
                  Accept, defer, or dismiss a finding, then inspect a reversible managed preview.
                </span>
              </li>
              <li>
                <strong>Recapture before “fixed”</strong>
                <span>
                  Only fresh evidence from the same scope can verify a measured improvement.
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
              <h2 id="availability-title">Know exactly what Sundae can do today.</h2>
              <p>
                The launch surface distinguishes working product from planned product. “Coming soon”
                is a roadmap promise, never a disabled control pretending to work.
              </p>
            </div>
            <div className={styles.capabilityLedger}>
              <article className={styles.capabilityBand}>
                <div>
                  <span className={styles.availableLabel}>
                    <i /> Available now
                  </span>
                  <h3>One complete public audit loop</h3>
                </div>
                <ul>
                  <li>Public URL and optional review goal</li>
                  <li>ChatGPT handoff with an exact workspace fallback</li>
                  <li>Evidence-linked measured and judged findings</li>
                  <li>Reversible preview and scoped recapture</li>
                  <li>Visible WebMCP tools in supported Site Tools hosts</li>
                </ul>
              </article>
              <article className={styles.capabilityBand}>
                <div>
                  <span className={styles.comingSoonLabel}>Coming soon</span>
                  <h3>The broader product workspace</h3>
                </div>
                <ul>
                  <li>Public Sundae plugin directory listing</li>
                  <li>Automatic multi-route audit planning</li>
                  <li>Figma proposal handoff</li>
                  <li>Supervised logged-in product capture</li>
                  <li>Saved, shareable audit workspaces</li>
                </ul>
              </article>
            </div>
          </section>

          <section className={styles.handoff} aria-labelledby="handoff-title">
            <div>
              <h2 id="handoff-title">Move the audit into ChatGPT—not into a disconnected chat.</h2>
              <p>
                Sundae carries the exact target, goal, and workspace into a ready-to-send request.
                In a supported ChatGPT built-in browser, the preserved workspace exposes Site Tools
                on the page. Everywhere else, the visible workspace remains the recovery path.
              </p>
            </div>
            <a href="#launch">Prepare the handoff</a>
          </section>
        </main>
      </div>
      <Workbench initialUrl={initialTarget} auditGoal={initialGoal} />
    </>
  );
}
