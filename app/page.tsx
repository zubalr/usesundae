import { AuditIntentProvider } from "@/components/AuditIntent";
import { AuditLauncher } from "@/components/AuditLauncher";
import { Workbench } from "@/components/Workbench";
import { MAX_AUDIT_GOAL_LENGTH, MAX_PUBLIC_URL_LENGTH, resolvePublicDemoUrl } from "@/lib/launch";
import styles from "./page.module.css";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUNDOWN_STEPS = [
  {
    title: "Product job",
    detail: "Orient the visible product, audience, and task before critique.",
    owner: "ChatGPT",
  },
  {
    title: "Visual system",
    detail: "Judge hierarchy, type, spacing, color, and product meaning.",
    owner: "ChatGPT",
  },
  {
    title: "UX architecture",
    detail: "Trace clarity, next-step friction, and visible dead ends.",
    owner: "ChatGPT",
  },
  {
    title: "Interaction + motion",
    detail: "Inspect affordance, feedback, focus, and observed states.",
    owner: "ChatGPT",
  },
  {
    title: "Human decision",
    detail: "You accept, defer, or dismiss before any preview begins.",
    owner: "You",
  },
  {
    title: "Fresh recapture",
    detail: "Sundae re-measures the same scope before calling a fact fixed.",
    owner: "Required",
  },
] as const;

function firstBoundedParam(value: string | string[] | undefined, maxLength: number) {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.slice(0, maxLength) ?? "";
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const initialTarget = firstBoundedParam(params.url, MAX_PUBLIC_URL_LENGTH);
  const initialGoal = firstBoundedParam(params.goal, MAX_AUDIT_GOAL_LENGTH);
  const includedDemoUrl = resolvePublicDemoUrl(process.env.SUNDAE_APP_ORIGIN);

  if (initialTarget.trim()) {
    return (
      <AuditIntentProvider initialTarget={initialTarget} initialGoal={initialGoal}>
        <Workbench
          initialUrl={initialTarget}
          auditGoal={initialGoal}
          includedDemoUrl={includedDemoUrl}
        />
      </AuditIntentProvider>
    );
  }

  return (
    <AuditIntentProvider initialTarget="" initialGoal={initialGoal}>
      <div className={styles.landing} id="top">
        <header className={styles.masthead}>
          <a className={styles.wordmark} href="#top" aria-label="Sundae home">
            sundae
          </a>
          <nav aria-label="Landing page navigation">
            <a href="#method">Why WebMCP</a>
            <a href="#desktop">ChatGPT Desktop</a>
            <a className={styles.navAction} href="/demo">
              Open /demo
            </a>
          </nav>
        </header>

        <main aria-label="Sundae product review entrance">
          <section className={styles.hero} aria-labelledby="landing-title">
            <div className={styles.heroThesis}>
              <h1 id="landing-title">Audit the same live page together.</h1>
              <p>
                Screenshot audits split the interface, model conversation, evidence, and decisions.
                Sundae makes the open page the shared WebMCP tool host: ChatGPT records evidence
                through Site Tools, you govern judgment, and fresh recapture is required before
                “fixed.”
              </p>
            </div>

            <section className={styles.liveSet} aria-label="Sundae shared audit loop">
              <section className={styles.programStage} aria-label="Included controlled demo">
                <div className={styles.programHeader}>
                  <span>
                    <i /> Included /demo · controlled target
                  </span>
                  <span>11 page-hosted tools · zero provider keys</span>
                </div>

                <div className={styles.fixtureWindow}>
                  <iframe
                    className={styles.fixturePreview}
                    src="/demo?state=baseline"
                    title="Sundae Lab controlled demo preview"
                    tabIndex={-1}
                    aria-hidden="true"
                    sandbox="allow-same-origin"
                    scrolling="no"
                  />
                  <div className={styles.fixtureLabel} aria-hidden="true">
                    <span>Live controlled product surface</span>
                    <span>Evidence stays on the board</span>
                  </div>
                </div>

                <div className={styles.commandStrip}>
                  <div className={styles.commandCopy}>
                    <h2>Put a page on the shared board.</h2>
                    <p>
                      The included demo is guaranteed. Public capture is a bounded secondary path.
                    </p>
                  </div>
                  <AuditLauncher includedDemoUrl={includedDemoUrl} />
                </div>
              </section>

              <aside className={styles.rundown} aria-labelledby="rundown-title">
                <header>
                  <h2 id="rundown-title">Audit rundown</h2>
                  <span>One visible session</span>
                </header>
                <ol>
                  {RUNDOWN_STEPS.map((step, index) => (
                    <li key={step.title} data-owner={step.owner === "You" ? "human" : "agent"}>
                      <span className={styles.stepNumber}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>{step.title}</strong>
                        <p>{step.detail}</p>
                      </div>
                      <span className={styles.stepOwner}>{step.owner}</span>
                    </li>
                  ))}
                </ol>
                <span className={styles.playhead} aria-hidden="true" />
              </aside>
            </section>
          </section>

          <section className={styles.method} id="method" aria-labelledby="method-title">
            <div className={styles.methodLead}>
              <h2 id="method-title">WebMCP makes the page the operating surface.</h2>
              <p>
                The model does not disappear behind a report API. Its commands, evidence, and
                receipts live on the same interface the person can inspect and control.
              </p>
            </div>

            <div className={styles.causalProof}>
              <article>
                <h3>Screenshot chat</h3>
                <p>
                  The image, conversation, evidence, and decision trail live in different places.
                  The result is hard to inspect and easy to overclaim.
                </p>
              </article>
              <article>
                <h3>Sundae + WebMCP</h3>
                <p>
                  ChatGPT operates goal-shaped Site Tools on the visible board. The person sees the
                  mutation, controls decisions, and can demand a fresh same-scope measurement.
                </p>
              </article>
            </div>

            <ol className={styles.operatingRules}>
              <li>
                <strong>Measure</strong>
                <span>Deterministic facts remain distinct from design judgment.</span>
              </li>
              <li>
                <strong>Orient</strong>
                <span>ChatGPT names the visible product job before criticizing the interface.</span>
              </li>
              <li>
                <strong>Decide</strong>
                <span>Only the person authorizes accept, defer, dismiss, or preview state.</span>
              </li>
              <li>
                <strong>Verify</strong>
                <span>A reversible preview is not proof; a fresh matching recapture is.</span>
              </li>
            </ol>
          </section>

          <section className={styles.availability} aria-labelledby="availability-title">
            <div className={styles.availabilityLead}>
              <h2 id="availability-title">One product, two honest scopes.</h2>
              <p>
                Start with the guaranteed contest workspace. Use public capture only when the
                configured browser provider can render the approved page.
              </p>
            </div>
            <dl className={styles.toolLedger}>
              <div>
                <dt>Included /demo</dt>
                <dd className={styles.toolCount}>11 Site Tools</dd>
                <dd className={styles.toolDescription}>
                  Complete zero-key proof on Sundae&apos;s controlled product.
                </dd>
              </div>
              <div>
                <dt>Approved public page</dt>
                <dd className={styles.toolCount}>15 Site Tools</dd>
                <dd className={styles.toolDescription}>
                  Four bounded capture commands; no login, cookies, or recursive crawl.
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.desktopGuide} id="desktop" aria-labelledby="desktop-title">
            <div>
              <h2 id="desktop-title">ChatGPT Desktop discovers the tools from the page.</h2>
              <p>
                A webpage cannot force-open ChatGPT&apos;s built-in browser. Prepare the exact
                workspace here, then paste its URL into that browser. If Site Tools are unavailable,
                Sundae says so and keeps the human controls usable.
              </p>
            </div>
            <ol>
              <li>Prepare the included demo or an approved public workspace.</li>
              <li>Open ChatGPT Desktop&apos;s built-in browser and paste the exact URL.</li>
              <li>Wait for Site Tools to appear before asking ChatGPT to audit.</li>
            </ol>
            <a href="#launch">Prepare the handoff</a>
          </section>
        </main>

        <footer className={styles.footer}>
          <strong>sundae</strong>
          <span>Shared evidence. Human authority. Fresh proof.</span>
          <a href="https://github.com/zubalr/usesundae">Source on GitHub</a>
        </footer>
      </div>
    </AuditIntentProvider>
  );
}
