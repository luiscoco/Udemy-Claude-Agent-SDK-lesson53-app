import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requestApproval,
  resolveApproval,
  pendingCount,
  validateDecision,
} from "./approvals.js";
import { ReplyLedger, SAFE_TOOLS, SEND, Triage } from "./helpdesk.js";
import { validateConfig } from "./protocol.js";
test("sender is excluded from automatic allow rules", () => {
  assert.equal(SAFE_TOOLS.includes(SEND), false);
  assert.equal(SAFE_TOOLS.length, 3);
  assert.ok(SAFE_TOOLS.every((n) => !n.includes("*")));
});
test("approval grants bind exact ticket and body, once", () => {
  const l = new ReplyLedger();
  l.grant("T-1", "Original");
  assert.equal(l.consume("T-2", "Original"), false);
  assert.equal(l.consume("T-1", "Edited"), false);
  assert.equal(l.consume("T-1", "Original"), true);
  assert.equal(l.consume("T-1", "Original"), false);
});
test("register before emitting and refuse replay", async () => {
  let id = "";
  const p = requestApproval(
    {
      ticketId: "T-1",
      body: "Draft",
      toolUseId: "native-id",
      repliesBeforeDecision: 0,
    },
    (e) => {
      id = e.request.id;
      assert.equal(pendingCount(), 1);
      assert.equal(
        resolveApproval(id, { action: "edit", body: "Reviewed" }),
        true,
      );
    },
    new AbortController().signal,
  );
  assert.deepEqual(await p, { action: "edit", body: "Reviewed" });
  assert.equal(pendingCount(), 0);
  assert.equal(resolveApproval(id, { action: "approve" }), false);
});
test("abort rejects and removes waiter", async () => {
  const c = new AbortController();
  let id = "";
  const p = requestApproval(
    {
      ticketId: "T-1",
      body: "Draft",
      toolUseId: "native-id",
      repliesBeforeDecision: 0,
    },
    (e) => (id = e.request.id),
    c.signal,
  );
  c.abort();
  assert.equal((await p).action, "reject");
  assert.equal(resolveApproval(id, { action: "approve" }), false);
  assert.equal(pendingCount(), 0);
});
test("expiry never authorizes a reply", async () => {
  const p = requestApproval(
    {
      ticketId: "T-1",
      body: "Draft",
      toolUseId: "native-id",
      repliesBeforeDecision: 0,
    },
    () => {},
    new AbortController().signal,
    5,
  );
  assert.equal((await p).action, "reject");
  assert.equal(pendingCount(), 0);
});
test("browser decision cannot retarget or inject settings", () => {
  assert.throws(() =>
    validateDecision({ id: "x", action: "edit", body: "OK", ticketId: "T-2" }),
  );
  assert.throws(() => validateDecision({ id: "x", action: "edit", body: " " }));
  assert.throws(() =>
    validateDecision({ id: "x", action: "edit", body: "x".repeat(1601) }),
  );
  assert.deepEqual(
    validateDecision({ id: "x", action: "edit", body: " Reviewed " }).decision,
    { action: "edit", body: "Reviewed" },
  );
});
test("configuration and structured results are bounded", () => {
  assert.throws(() => validateConfig({ mode: "approve", body: "preapproved" }));
  assert.throws(() => validateConfig({ mode: "unknown" }));
  assert.throws(() =>
    Triage.parse({
      ticketId: "T-1",
      category: "billing",
      priority: "high",
      confidence: 2,
      replyStatus: "recorded",
    }),
  );
  assert.ok(
    Triage.parse({
      ticketId: "T-1",
      category: "billing",
      priority: "high",
      confidence: 0.9,
      replyStatus: "rejected",
    }),
  );
});
