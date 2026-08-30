"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

type AuditIntentValue = {
  targetUrl: string;
  goal: string;
  setTargetUrl: (value: string) => void;
  setGoal: (value: string) => void;
};

const AuditIntentContext = createContext<AuditIntentValue | null>(null);

export function AuditIntentProvider({
  initialTarget,
  initialGoal,
  children,
}: {
  initialTarget: string;
  initialGoal: string;
  children: ReactNode;
}) {
  const [targetUrl, setTargetUrl] = useState(initialTarget);
  const [goal, setGoal] = useState(initialGoal);
  const value = useMemo(
    () => ({
      targetUrl,
      goal,
      setTargetUrl,
      setGoal,
    }),
    [targetUrl, goal],
  );
  return <AuditIntentContext.Provider value={value}>{children}</AuditIntentContext.Provider>;
}

export function useAuditIntent() {
  const context = useContext(AuditIntentContext);
  if (!context) throw new Error("AuditIntentProvider is required for the audit entry surface.");
  return context;
}
