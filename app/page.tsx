import { AuditIntentProvider } from "@/components/AuditIntent";
import { AuditLauncher, ChatGptNextStep } from "@/components/AuditLauncher";
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

const DEMO_TOOLS = [
  ["audit_current_scope", "Measure the live included target; returns the first board page"],
  ["inspect_agent_surface", "Inspect the controlled target’s WebMCP contracts"],
  ["get_board_context", "Read bounded evidence, decisions, gaps, and next work"],
  ["record_audit_brief", "Orient the product before judging the interface"],
  ["record_review_result", "Preserve a strength or an inspected no-issue result"],
  ["record_visual_finding", "Add a supported UI, UX, or Interaction judgment"],
  ["record_coverage_gap", "Record an important surface that was not observed"],
  ["focus_finding", "Select evidence on the visible board"],
  ["set_finding_decision", "Record the person’s reversible decision and reason"],
  ["preview_fix", "Render a reversible local preview"],
  ["verify_recapture", "Re-measure the same scope before calling a fact fixed"],
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
            <a href="#judges">For WebMCP Challenge judges →</a>
          </nav>
        </header>

        <main aria-label="Sundae product review entrance">
          <section className={styles.hero} aria-labelledby="landing-title">
            <div className={styles.heroThesis}>
              <h1 id="landing-title">AI audits your product&rsquo;s design.</h1>
              <p>
                Every finding is a measurement you can check, on a page you can inspect, with fixes
                proved by fresh evidence.
              </p>
              <aside
                className={styles.measuredFinding}
                aria-label="Measured finding from a live capture"
              >
                <p>
                  On a live product page, Sundae measured the primary call-to-action at 4.09:1
                  contrast — under the 4.5:1 threshold, on the brand&rsquo;s own red — and counted
                  it among 28 controls below the 44 × 44 touch-target guidance.
                </p>
                <p className={styles.measuredSource}>
                  Measured from a live public capture at mobile.
                </p>
              </aside>
            </div>

            <section className={styles.liveSet} aria-label="Sundae shared audit loop">
              <section className={styles.programStage} aria-label="Included controlled demo">
                <div className={styles.programHeader}>
                  <span>
                    <i /> Live product on this page
                  </span>
                  <span>Your agent measures what you can see</span>
                </div>

                <div className={styles.commandStrip}>
                  <AuditLauncher includedDemoUrl={includedDemoUrl} />
                </div>

                <div className={styles.fixtureWindow}>
                  <iframe
                    className={styles.fixturePreview}
                    src="/demo?state=baseline"
                    title="Sundae Lab controlled demo preview"
                    tabIndex={-1}
                    aria-hidden="true"
                    sandbox="allow-same-origin allow-scripts"
                    scrolling="no"
                  />
                  <div className={styles.fixtureLabel} aria-hidden="true">
                    <span>Live controlled product surface</span>
                    <span>Evidence stays on the board</span>
                  </div>
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
                        <div className={styles.stepHead}>
                          <strong>{step.title}</strong>
                          <span className={styles.stepOwner}>{step.owner}</span>
                        </div>
                        <p>{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <span className={styles.playhead} aria-hidden="true" />
              </aside>
            </section>
          </section>

          <section className={styles.method} id="method" aria-labelledby="method-title">
            <div className={styles.methodLead}>
              <h2 id="method-title">The audit stays on a page you can inspect.</h2>
              <p>
                Other tools assert findings in a chat. Sundae leaves the measurement, the judgment,
                and the proof on the same board you are looking at.
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
                <h3>Sundae</h3>
                <p>
                  Findings sit on the live page. You see the measurement, you control the decision,
                  and a fresh capture has to prove a fix.
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

          <section className={styles.judgePath} id="judges" aria-labelledby="judges-title">
            <div className={styles.judgeLead}>
              <h2 id="judges-title">For WebMCP Challenge judges</h2>
              <p>
                WebMCP is the warrant for the audit. Site Tools have been verified on GPT-5.6 Sol
                and GPT-5.6 Terra in two places: the ChatGPT desktop app&rsquo;s built-in browser,
                and ChatGPT Work Cloud at chatgpt.com. GPT-5.6 Luna has WebMCP disabled and will not
                discover Site Tools. Site Tools are also unavailable in Enterprise and Edu
                workspaces. A host may deny an individual tool call; the rest of the audit still
                completes.
              </p>
            </div>

            <div className={styles.judgeHandoff}>
              <ChatGptNextStep includedDemoUrl={includedDemoUrl} />
            </div>

            <ol className={styles.judgeSteps}>
              <li>
                Open ChatGPT Desktop&rsquo;s built-in browser, or ChatGPT Work Cloud, at the exact{" "}
                <a href="/demo">published /demo workspace</a>.
              </li>
              <li>
                Click <strong>Site tools</strong> in the browser address bar. You should see 11
                Sundae tools. If the panel is empty, check the model first.
              </li>
              <li>
                Ask ChatGPT to audit the page with its Site Tools, keep measurements and judgment
                separate, and ask you before any decision or preview.
              </li>
              <li>
                Accept a finding with a visible reason, then let it run <code>preview_fix</code> and{" "}
                <code>verify_recapture</code>.
              </li>
            </ol>

            <div className={styles.availabilityLead}>
              <h3>One product, two honest scopes.</h3>
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
                  Complete zero-key proof on Sundae&rsquo;s controlled product.
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

            <div className={styles.desktopGuide} id="desktop" aria-labelledby="desktop-title">
              <div>
                <h3 id="desktop-title">ChatGPT Desktop discovers the tools from the page.</h3>
                <p>
                  A webpage cannot force-open ChatGPT. Prepare the exact workspace here, then open
                  it in ChatGPT Desktop&rsquo;s built-in browser or ChatGPT Work Cloud. If Site
                  Tools are unavailable, Sundae says so and keeps the human controls usable.
                </p>
              </div>
              <ol>
                <li>Prepare the included demo or an approved public workspace.</li>
                <li>
                  Open ChatGPT Desktop&rsquo;s built-in browser or ChatGPT Work Cloud and paste the
                  exact URL.
                </li>
                <li>Wait for Site Tools to appear before asking ChatGPT to audit.</li>
              </ol>
              <a href="#launch">Prepare the handoff</a>
            </div>

            <div className={styles.toolTableFrame}>
              <table className={styles.toolTable}>
                <caption>The 11 Site Tools on the included /demo</caption>
                <thead>
                  <tr>
                    <th scope="col">Tool</th>
                    <th scope="col">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {DEMO_TOOLS.map(([name, purpose]) => (
                    <tr key={name}>
                      <th scope="row">
                        <code>{name}</code>
                      </th>
                      <td>{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <footer className={styles.footer}>
          <strong>sundae</strong>
          <span>Measured findings. Human authority. Fresh proof.</span>
          <a href="https://github.com/zubalr/usesundae">Source on GitHub</a>
        </footer>
      </div>
    </AuditIntentProvider>
  );
}
