import { randomUUID } from "node:crypto";
import type { Decision, ApprovalRequest, LabEvent } from "./protocol.js";
const pending = new Map<string, (decision: Decision) => void>();
export function pendingCount() {
  return pending.size;
}
export function validateDecision(value: any): {
  id: string;
  decision: Decision;
} {
  if (
    !value ||
    typeof value.id !== "string" ||
    !["approve", "edit", "reject"].includes(value.action) ||
    Object.keys(value).some(
      (k) => !["id", "action", "body", "reason"].includes(k),
    )
  )
    throw new Error("Provide an approval ID and a listed decision.");
  if (
    value.action === "edit" &&
    (typeof value.body !== "string" ||
      !value.body.trim() ||
      value.body.length > 1600)
  )
    throw new Error("Edited body must contain 1 to 1600 characters.");
  if (
    value.reason !== undefined &&
    (typeof value.reason !== "string" || value.reason.length > 300)
  )
    throw new Error("Rejection reason is too long.");
  return {
    id: value.id,
    decision: {
      action: value.action,
      ...(value.action === "edit" ? { body: value.body.trim() } : {}),
      ...(value.reason ? { reason: value.reason } : {}),
    },
  };
}
export function resolveApproval(id: string, decision: Decision) {
  const settle = pending.get(id);
  if (!settle) return false;
  settle(decision);
  return true;
}
export function requestApproval(
  details: Omit<ApprovalRequest, "id" | "deadline">,
  emit: (event: LabEvent) => void,
  signal: AbortSignal,
  timeoutMs = 120000,
): Promise<Decision> {
  return new Promise((resolve) => {
    const id = randomUUID();
    let timer: ReturnType<typeof setTimeout>;
    const settle = (decision: Decision) => {
      if (!pending.delete(id)) return;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolve(decision);
    };
    const abort = () =>
      settle({ action: "reject", reason: "Approval cancelled or expired." });
    pending.set(id, settle);
    timer = setTimeout(abort, timeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    emit({
      type: "approval-request",
      request: {
        ...details,
        id,
        deadline: new Date(Date.now() + timeoutMs).toISOString(),
      },
    });
  });
}
