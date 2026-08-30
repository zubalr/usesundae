import { redirect } from "next/navigation";

import { buildPublicDemoWorkspacePath } from "@/lib/launch";
import styles from "./demo.module.css";
import { DemoWebMcp } from "./DemoWebMcp";

type DemoPageProps = { searchParams: Promise<{ state?: string }> };

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

function PulseMark() {
  return (
    <svg aria-hidden="true" className={styles.mark} viewBox="0 0 32 32">
      <path d="M4 18h6l3-9 6 15 3-8h6" />
    </svg>
  );
}

export default async function DemoPage({ searchParams }: DemoPageProps) {
  const query = await searchParams;
  if (!query.state) {
    redirect(buildPublicDemoWorkspacePath(process.env.SUNDAE_APP_ORIGIN));
  }
  const improved = query.state === "improved";
  const stateClass = improved ? styles.improved : styles.baseline;

  return (
    <main
      className={`${styles.product} ${stateClass}`}
      data-demo-state={improved ? "improved" : "baseline"}
      aria-label="Sundae Lab demo product"
    >
      <DemoWebMcp />
      <header className={styles.topbar}>
        <a className={styles.brand} href="#main">
          <PulseMark />
          Sundae Lab
        </a>
        <nav aria-label="Product navigation">
          <a className={styles.active} href="#main">
            Overview
          </a>
          <a href="#workflows">Workflows</a>
          <a href="#signals">Signals</a>
        </nav>
        <div className={styles.account}>
          <button
            id="notifications"
            className={styles.iconButton}
            type="button"
            aria-label={improved ? "Open notifications" : undefined}
          >
            <BellIcon />
          </button>
          <span className={styles.avatar} aria-hidden="true">
            AK
          </span>
        </div>
      </header>

      <div className={styles.content} id="main">
        <section className={styles.hero}>
          <div>
            <p className={styles.date}>Product operations</p>
            <h1>
              {improved
                ? "Find workflow issues your team can fix today."
                : "Operational intelligence for teams who need visibility across their workflows."}
            </h1>
          </div>
          <button id="primary-action" className={styles.primaryAction} type="button">
            <span>{improved ? "Audit workflows" : "Initialize workspace"}</span>
            <ArrowIcon />
          </button>
        </section>

        <section className={styles.metrics} aria-label="Workspace summary">
          <div>
            <span>Active workflows</span>
            <strong id="active-workflow-count">18</strong>
            <small>3 need attention</small>
          </div>
          <div>
            <span>Signals reviewed</span>
            <strong>247</strong>
            <small>92% this week</small>
          </div>
          <div>
            <span>Team response</span>
            <strong>2.4h</strong>
            <small>↓ 18 min</small>
          </div>
        </section>

        <section className={styles.activity} id="workflows">
          <div className={styles.sectionHead}>
            <div>
              <h2>Workflow health</h2>
              <p id="workflow-helper">Live signals from the last seven days.</p>
            </div>
            <button type="button">View all</button>
          </div>

          <div className={styles.tableShell}>
            <div className={styles.table} role="table" aria-label="Workflow health">
              <div className={styles.tableHeader} role="row">
                <span role="columnheader">Workflow</span>
                <span role="columnheader">Owner</span>
                <span role="columnheader">Signal</span>
                <span role="columnheader">Status</span>
              </div>
              <div
                className={styles.tableRow}
                role="row"
                data-workflow-row
                data-workflow-name="Activation handoff"
                id="workflow-activation-handoff"
              >
                <span role="cell">
                  <i className={styles.dotCoral} />
                  Activation handoff
                </span>
                <span role="cell">Mara K.</span>
                <span role="cell">14 open</span>
                <span role="cell">
                  <b className={styles.needsReview}>Needs review</b>
                </span>
              </div>
              <div
                className={styles.tableRow}
                role="row"
                data-workflow-row
                data-workflow-name="Weekly planning"
                id="workflow-weekly-planning"
              >
                <span role="cell">
                  <i className={styles.dotTeal} />
                  Weekly planning
                </span>
                <span role="cell">Theo R.</span>
                <span role="cell">3 open</span>
                <span role="cell">
                  <b className={styles.healthy}>Healthy</b>
                </span>
              </div>
              <div
                className={styles.tableRow}
                role="row"
                data-workflow-row
                data-workflow-name="Customer follow-up"
                id="workflow-customer-follow-up"
              >
                <span role="cell">
                  <i className={styles.dotAmber} />
                  Customer follow-up
                </span>
                <span role="cell">Asha N.</span>
                <span role="cell">7 open</span>
                <span role="cell">
                  <b className={styles.watch}>Watch</b>
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
