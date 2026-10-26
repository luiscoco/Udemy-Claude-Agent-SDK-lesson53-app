import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
export const SEND = "mcp__helpdesk__send_reply";
export const SAFE_TOOLS = [
  "mcp__helpdesk__get_ticket",
  "mcp__helpdesk__get_customer_history",
  "mcp__helpdesk__set_priority",
];
export const PRIORITY = ["low", "normal", "high", "urgent"] as const;
export const CATEGORY = ["billing", "access", "technical", "feature"] as const;
export const Triage = z
  .object({
    ticketId: z.string(),
    category: z.enum(CATEGORY),
    priority: z.enum(PRIORITY),
    confidence: z.number().min(0).max(1),
    replyStatus: z.enum(["recorded", "rejected", "not_sent"]),
  })
  .strict();
export const triageSchema = z.toJSONSchema(Triage, { target: "draft-7" });
export class ReplyLedger {
  private grants = new Set<string>();
  private key(ticketId: string, body: string) {
    return createHash("sha256")
      .update(JSON.stringify({ ticketId, body }))
      .digest("hex");
  }
  grant(ticketId: string, body: string) {
    this.grants.add(this.key(ticketId, body));
  }
  consume(ticketId: string, body: string) {
    return this.grants.delete(this.key(ticketId, body));
  }
}
export async function createHelpdesk(
  runId: string,
  historyError: boolean,
  record: (name: string, input: any, ok: boolean, output: any) => void,
) {
  const folder = new URL("../.runtime/runs/" + runId + "/", import.meta.url);
  await mkdir(folder, { recursive: true });
  const file = new URL("helpdesk.json", folder),
    state = JSON.parse(
      await readFile(
        new URL("../fixtures/helpdesk.json", import.meta.url),
        "utf8",
      ),
    );
  const ledger = new ReplyLedger();
  let saves = Promise.resolve();
  const save = () => {
    saves = saves.then(() =>
      writeFile(file, JSON.stringify(state, null, 2) + "\n"),
    );
    return saves;
  };
  await save();
  const ticket = (id: string) => {
    const t = state.tickets.find((t: any) => t.id === id);
    if (!t) throw new Error("Ticket not found: " + id);
    return t;
  };
  const wrap =
    (name: string, fn: (input: any) => Promise<any>) => async (input: any) => {
      try {
        const output = await fn(input);
        record(name, input, true, output);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(output) }],
        };
      } catch (e) {
        const output =
          e instanceof Error ? e.message : "Local helpdesk operation failed";
        record(name, input, false, output);
        return {
          isError: true,
          content: [{ type: "text" as const, text: output }],
        };
      }
    };
  const getTicket = tool(
    "get_ticket",
    "Read one fictional support ticket; this cannot send a message.",
    { ticketId: z.string().max(30) },
    wrap("get_ticket", async ({ ticketId }) => ({
      ...ticket(ticketId),
      policy:
        "Fictional classroom data. Investigate duplicate charges without promising a refund. Never request passwords or claim a real message was sent.",
    })),
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );
  const getHistory = tool(
    "get_customer_history",
    "Read fictional customer history for a ticket.",
    { ticketId: z.string().max(30) },
    wrap("get_customer_history", async ({ ticketId }) => {
      const t = ticket(ticketId);
      if (historyError)
        throw new Error(
          "Controlled classroom history-service error; do not invent customer history.",
        );
      return { ticketId, history: state.history[t.customerId] || [] };
    }),
    { annotations: { readOnlyHint: true }, alwaysLoad: true },
  );
  const setPriority = tool(
    "set_priority",
    "Set category and priority on the local fictional ticket. No message is sent.",
    {
      ticketId: z.string().max(30),
      priority: z.enum(PRIORITY),
      category: z.enum(CATEGORY),
    },
    wrap("set_priority", async ({ ticketId, priority, category }) => {
      Object.assign(ticket(ticketId), { priority, category });
      await save();
      return { ticketId, priority, category, scope: "Local JSON only" };
    }),
    {
      annotations: { readOnlyHint: false, destructiveHint: false },
      alwaysLoad: true,
    },
  );
  const sendReply = tool(
    "send_reply",
    "Record a fictional customer-facing reply after human approval. The local fixture has no email transport.",
    { ticketId: z.string().max(30), body: z.string().trim().min(1).max(1600) },
    wrap("send_reply", async ({ ticketId, body }) => {
      ticket(ticketId);
      if (state.replies.some((r: any) => r.ticketId === ticketId))
        throw new Error(
          "A reply has already been recorded for this ticket in this run.",
        );
      if (!ledger.consume(ticketId, body))
        throw new Error(
          "No matching one-use approval for this exact ticket and reply body.",
        );
      const reply = {
        ticketId,
        body,
        recordedAt: new Date().toISOString(),
        transport: "local-json-only",
      };
      state.replies.push(reply);
      await save();
      return { ...reply, status: "Recorded locally; no real message was sent" };
    }),
    {
      annotations: { readOnlyHint: false, destructiveHint: true },
      alwaysLoad: true,
    },
  );
  const server = createSdkMcpServer({
    name: "helpdesk",
    version: "1.0.0",
    tools: [getTicket, getHistory, setPriority, sendReply],
    alwaysLoad: true,
  });
  return {
    server,
    ledger,
    ticket,
    snapshot: () => structuredClone(state),
    replies: () => state.replies.length,
    savedFile: ".runtime/runs/" + runId + "/helpdesk.json",
    async saveAudit(audit: any) {
      await writeFile(
        new URL("audit.json", folder),
        JSON.stringify(audit, null, 2),
      );
    },
  };
}
