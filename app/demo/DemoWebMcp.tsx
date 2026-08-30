"use client";

import { useEffect, useState } from "react";

import {
  demoWebMcpReadyMessage,
  DEMO_TOOL_CONTRACTS,
  DEMO_WEBMCP_STATUS_MESSAGES,
  DEMO_WORKFLOW_NAMES,
} from "@/lib/demo/tools";
import { WEBMCP_REGISTRATION_GRACE_MS } from "@/lib/webmcp/register";
import styles from "./demo.module.css";

type FixtureStatus = "checking" | "ready" | "unavailable" | "error";

function result(payload: Record<string, unknown>): WebMcpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

function workflowName(input: Record<string, unknown>) {
  const value = input.workflow_name;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("workflow_name is required.");
  }
  const normalized = value.trim();
  if (normalized.length > 80) throw new Error("workflow_name must contain 80 characters or fewer.");
  return normalized;
}

function visibleWorkflowRows() {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-workflow-row]")).filter(
    (row) => !row.hidden,
  );
}

function setReceipt(message: string) {
  const receipt = document.getElementById("fixture-receipt");
  if (receipt) receipt.textContent = message;
}

export function DemoWebMcp() {
  const [status, setStatus] = useState<FixtureStatus>("checking");
  const [statusMessage, setStatusMessage] = useState<string>(DEMO_WEBMCP_STATUS_MESSAGES.checking);

  useEffect(() => {
    document.documentElement.dataset.sundaeWebmcpFixture = status;
    return () => {
      delete document.documentElement.dataset.sundaeWebmcpFixture;
    };
  }, [status]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) {
      setStatus("unavailable");
      setStatusMessage(DEMO_WEBMCP_STATUS_MESSAGES.unavailable);
      return;
    }

    const controller = new AbortController();
    let active = true;
    const fallback = window.setTimeout(() => {
      setStatus("unavailable");
      setStatusMessage(DEMO_WEBMCP_STATUS_MESSAGES.unavailable);
    }, WEBMCP_REGISTRATION_GRACE_MS);
    const toolHandlers: Record<string, (input: Record<string, unknown>) => WebMcpToolResult> = {
      sundae_lab_get_workflow_summary: () => {
        const visible = visibleWorkflowRows().length;
        const archived = DEMO_WORKFLOW_NAMES.length - visible;
        const receipt = `Read ${visible} visible workflow rows from the controlled fixture.`;
        setReceipt(receipt);
        return result({
          ok: true,
          active_workflows: 18 - archived,
          visible_workflows: visible,
          signals_reviewed: 247,
          receipt,
        });
      },
      sundae_lab_archive_workflow: (input) => {
        const requested = workflowName(input);
        const row = visibleWorkflowRows().find(
          (candidate) => candidate.dataset.workflowName?.toLowerCase() === requested.toLowerCase(),
        );
        if (!row) {
          const receipt = `No visible workflow named “${requested}” was archived.`;
          setReceipt(receipt);
          return result({ ok: false, archived: false, error: "Workflow not found.", receipt });
        }

        row.hidden = true;
        row.setAttribute("aria-hidden", "true");
        const activeCount = document.getElementById("active-workflow-count");
        if (activeCount)
          activeCount.textContent = String(
            18 - (DEMO_WORKFLOW_NAMES.length - visibleWorkflowRows().length),
          );
        const receipt = `Archived “${row.dataset.workflowName ?? requested}” in the controlled fixture; the row is now hidden from the visible list.`;
        setReceipt(receipt);
        return result({
          ok: true,
          archived: row.dataset.workflowName ?? requested,
          visible: false,
          receipt,
        });
      },
    };

    const tools: WebMcpTool[] = DEMO_TOOL_CONTRACTS.map((contract) => ({
      ...contract,
      description: contract.description ?? "",
      execute: async (input, extras) => {
        extras?.signal?.throwIfAborted();
        const handler = toolHandlers[contract.name];
        if (!handler)
          throw new Error(`The controlled fixture has no behavior for ${contract.name}.`);
        const output = handler(input);
        extras?.signal?.throwIfAborted();
        return output;
      },
    }));

    void (async () => {
      try {
        for (const tool of tools) {
          controller.signal.throwIfAborted();
          await context.registerTool(tool, { signal: controller.signal });
        }
        if (active) {
          window.clearTimeout(fallback);
          setStatus("ready");
          setStatusMessage(demoWebMcpReadyMessage(tools.length));
        }
      } catch (error) {
        if (!controller.signal.aborted) controller.abort(error);
        if (active) {
          window.clearTimeout(fallback);
          setStatus("error");
          setStatusMessage(DEMO_WEBMCP_STATUS_MESSAGES.error);
          setReceipt("WebMCP registration did not complete; no hidden fixture action was taken.");
        }
      }
    })();

    return () => {
      active = false;
      window.clearTimeout(fallback);
      controller.abort();
    };
  }, []);

  return (
    <aside
      id="fixture-webmcp-status"
      className={styles.fixtureStatus}
      data-status={status}
      aria-live="polite"
      aria-label={`Embedded WebMCP target status: ${statusMessage}`}
    >
      <span className={styles.fixtureStatusDot} aria-hidden="true" />
      <span>
        <strong>Embedded target</strong>
        <small>{statusMessage}</small>
      </span>
      <span id="fixture-receipt" className={styles.fixtureReceipt}>
        No fixture action yet.
      </span>
    </aside>
  );
}
