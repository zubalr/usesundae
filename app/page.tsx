import { AuditIntentProvider } from "@/components/AuditIntent";
import { AuditLauncher, ChatGptNextStep } from "@/components/AuditLauncher";
import { Workbench } from "@/components/Workbench";
import { includedDemoProofReceipt } from "@/lib/demo/included-receipt";
import { MAX_AUDIT_GOAL_LENGTH, MAX_PUBLIC_URL_LENGTH, resolvePublicDemoUrl } from "@/lib/launch";
import styles from "./page.module.css";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RUNDOWN_STEPS = [
  {
    title: "Understand",
    detail: "Your agent identifies the visible product, audience, and job.",
    owner: "ChatGPT",
  },
  {
    title: "Decide",
    detail: "Evidence and judgment stay separate; you choose what matters.",
    owner: "You",
  },
  {
    title: "Prove",
    detail: "Preview safely, then recheck before anything is called fixed.",
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

  const proof = includedDemoProofReceipt();

  return (
    <AuditIntentProvider initialTarget="" initialGoal={initialGoal}>
      <div className={styles.landing} id="top">
        <header className={styles.masthead}>
          <a className={styles.wordmark} href="#top" aria-label="Sundae home">
            sundae
          </a>
          <nav aria-label="Landing page navigation">
            <a href="#method">How it works</a>
            <a href="/demo">Live demo</a>
            <a href="https://github.com/zubalr/usesundae">GitHub</a>
            <a className={styles.judgeNav} href="#judges">
              Judge path
            </a>
          </nav>
        </header>

        <main aria-label="Sundae product review entrance">
          <section className={styles.hero} aria-labelledby="landing-title">
            <div className={styles.heroThesis}>
              <p className={styles.eyebrow}>A live design review with your AI</p>
              <h1 id="landing-title">Design reviews shouldn&rsquo;t disappear into chat.</h1>
              <p>
                Sundae turns a public page into a shared workspace for you and ChatGPT. See the
                product, the evidence, and every decision in one place—then preview and verify the
                change.
              </p>
            </div>

            <div className={styles.heroEntry}>
              <div className={styles.commandStrip}>
                <AuditLauncher includedDemoUrl={includedDemoUrl} />
              </div>
              <aside
                className={styles.proofReceipt}
                aria-label="Included demo finding and review path"
              >
                <p className={styles.proofTitle}>{proof.title}</p>
                <p>{proof.meaning}</p>
                <p className={styles.proofEvidence}>{proof.evidence}</p>
                <ol className={styles.proofTrail}>
                  <li>Measure</li>
                  <li>you decide</li>
                  <li>preview</li>
                  <li>recheck</li>
                </ol>
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
                  <div className={styles.fixtureLabel}>
                    <span>Included audit specimen</span>
                    <span>
                      This sample is deliberately flawed so you can inspect, preview, and verify the
                      complete Sundae workflow.
                    </span>
                  </div>
                </div>
              </section>

              <aside className={styles.rundown} aria-labelledby="rundown-title">
                <header>
                  <h2 id="rundown-title">How a review runs</h2>
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
              <h2 id="method-title">Your agent works where the product is.</h2>
              <p>
                Sundae keeps the live page, evidence, decisions, and verification together. You can
                see what ChatGPT saw and control what happens next.
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
              <h2 id="judges-title">Try the complete WebMCP loop in two minutes.</h2>
              <p>
                Open the included demo, ask ChatGPT to review the visible board, choose one finding,
                then preview and verify it. No account or capture key is needed for the sample.
              </p>
            </div>

            <div className={styles.judgeHandoff}>
              <a className={styles.openDemo} href="/demo">
                Open the live demo
              </a>
              <ChatGptNextStep includedDemoUrl={includedDemoUrl} />
            </div>

            <ol className={styles.judgeSteps}>
              <li>Open the demo.</li>
              <li>Ask ChatGPT to review it with Site Tools.</li>
              <li>Choose one finding.</li>
              <li>Preview and verify the improvement.</li>
            </ol>

            <div className={styles.disclosures}>
              <details>
                <summary>Browser and model support</summary>
                <p>
                  Site Tools have been verified on GPT-5.6 Sol and GPT-5.6 Terra in two places: the
                  ChatGPT desktop app&rsquo;s built-in browser, and ChatGPT Work Cloud at
                  chatgpt.com. GPT-5.6 Luna has WebMCP disabled and will not discover Site Tools.
                  Site Tools are also unavailable in Enterprise and Edu workspaces. A webpage cannot
                  force-open ChatGPT. Prepare the exact workspace here, then open it in ChatGPT
                  Desktop&rsquo;s built-in browser or ChatGPT Work Cloud. If Site Tools are
                  unavailable, Sundae says so and keeps the human controls usable.
                </p>
                <ol className={styles.desktopSteps}>
                  <li>Prepare the included demo or an approved public workspace.</li>
                  <li>
                    Open ChatGPT Desktop&rsquo;s built-in browser or ChatGPT Work Cloud and paste
                    the exact URL.
                  </li>
                  <li>Wait for Site Tools to appear before asking ChatGPT to review.</li>
                </ol>
              </details>

              <details>
                <summary>View the Site Tools</summary>
                <p>
                  The included /demo registers eleven Sundae workbench tools. A public workspace
                  adds four bounded capture commands, for 15 tools total.
                </p>
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
              </details>

              <details>
                <summary>Capture boundaries</summary>
                <p>
                  A host may deny an individual tool call; the rest of the audit still completes.
                  Start with the guaranteed contest workspace. Use public capture only when the
                  configured browser provider can render the approved page. Sundae does not log in,
                  use target-site cookies, submit forms, or crawl beyond the approved scope.
                </p>
              </details>
            </div>
          </section>
        </main>

        <footer className={styles.footer}>
          <strong>sundae</strong>
          <span>Every finding shows its evidence. Every decision stays yours.</span>
          <a href="https://github.com/zubalr/usesundae">Source on GitHub</a>
        </footer>
      </div>
    </AuditIntentProvider>
  );
}
