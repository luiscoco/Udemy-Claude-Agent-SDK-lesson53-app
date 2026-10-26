export const MODES = [
  "approve",
  "edit",
  "reject",
  "missing",
  "historyerror",
  "structured",
  "batch",
  "turnlimit",
  "audit",
] as const;
export type Mode = (typeof MODES)[number];
export type RunConfig = { mode: Mode };
export type LabEvent = { type: string; [key: string]: any };
export type Decision = {
  action: "approve" | "edit" | "reject";
  body?: string;
  reason?: string;
};
export type ApprovalRequest = {
  id: string;
  ticketId: string;
  body: string;
  deadline: string;
  toolUseId: string;
  repliesBeforeDecision: number;
};
export type ApprovalProvider = (
  request: ApprovalRequest,
  signal: AbortSignal,
) => Promise<Decision>;
export function validateConfig(input: any): RunConfig {
  if (
    !input ||
    Object.keys(input).some((k) => k !== "mode") ||
    !MODES.includes(input.mode)
  )
    throw new Error("Choose a listed triage experiment.");
  return { mode: input.mode };
}
