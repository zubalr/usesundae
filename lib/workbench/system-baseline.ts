export function systemBaselineKey(scopeId: string, state: string) {
  return `${scopeId}|${state}`;
}

export function committedSystemBaselineKey(
  scopeId: string,
  state: string,
  findingCount: number,
): string | null {
  return state === "baseline" && findingCount > 0 ? systemBaselineKey(scopeId, state) : null;
}

export function shouldCommitMeasuredSnapshot(state: string, findingCount: number) {
  return findingCount > 0 || state !== "baseline";
}

export function shouldScheduleSystemAudit(input: {
  committedKey: string | null;
  readyState?: string;
  demoStateAttr?: string | null;
  scopeId: string;
}) {
  const state = input.demoStateAttr === "improved" ? "improved" : "baseline";
  return (
    input.readyState === "complete" &&
    Boolean(input.demoStateAttr) &&
    input.committedKey !== systemBaselineKey(input.scopeId, state)
  );
}
