# Claude Agent SDK · Lesson 53 · Build a support triage agent

Five student pages, a real SDK lab with a fictional JSON helpdesk and thirteen source-linked UML code steps.

## What you will learn

- Design tools by risk: Read the fictional ticket and customer history, then tag category and priority automatically. A customer-facing reply is a different action and needs an explicit reviewer decision.
- Build four in-process MCP tools: Use tool(), Zod schemas and createSdkMcpServer for get_ticket, get_customer_history, set_priority and send_reply. The teaching helpdesk is a local JSON fixture, with no email provider.
- Pause at the native permission boundary: Leave send_reply out of allowedTools. The real canUseTool callback waits on a browser approval promise while the draft remains unrecorded.
- Approve, edit or reject: Approve the original draft, edit its body through updatedInput, or reject the native call. The UI cannot retarget a reply to another ticket. Each exact approved ticket/body grant can be consumed once.
- Handle errors and limits: Return isError for missing tickets and a deliberately unavailable history fixture. Preserve a native one-turn failure and validate a real typed triage result.
- Audit and batch safely: PostToolUse records actual tool results. Inspect local JSON and approval decisions together. Batch starts one fresh query per ticket and requires a separate review for each reply.

## Configure and run

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson53-app.git
cd .\Udemy-Claude-Agent-SDK-lesson53-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations: `cd .\agent-sdk\lesson53-support-triage`. Open http://127.0.0.1:3153. Node 24+, API credit and Windows Git Bash if needed.

## Create your .env file

Copy the template once and enter your own model key privately. Restart after edits. Existing shell values take precedence.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3153
# Windows only, if required:
# CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe
```

No real helpdesk credentials, email transport, GitHub token or Managed Agents IDs are required. The SDK key remains private.

## Run the experiments

### Review a real pending draft

Choose Approve, Edit or Reject and click Run. The real SDK reads the ticket and history, then tags it. When paused, inspect the draft and recorded-replies-before count. Click Approve, change the text and click Edit and approve, or click Reject. The mode name does not automatically approve anything.

```powershell
npm run sample:env -- approve
# Terminal sample also asks a/e/r before recording a reply.
```

### Compare errors and structured data

Missing reads T-404 and must stop without mutation. History error is a controlled local fixture failure; the draft must not invent history. Structured requests a schema-validated summary after the actual approval outcome.

```powershell
npm run sample:env -- missing
npm run sample:env -- historyerror
npm run sample:env -- structured
```

### Inspect batch, limits and audit

Batch runs two fresh queries and needs two explicit decisions. Turn limit preserves a native error_max_turns. Audit displays actual PostToolUse responses. Each run retains helpdesk.json and audit.json under the ignored .runtime/runs/<run-id> folder. Read this local record; it is not proof of real email delivery.

```powershell
npm run sample:env -- batch
npm run sample:env -- turnlimit
npm run sample:env -- audit
npm test
```

## How the app was built

### 1. Validate the experiment

Accept only a fixed lesson mode. Browser configuration cannot supply arbitrary paths, endpoints, tool definitions or approval decisions.

Source: `src/protocol.ts`, selected lines 33–41. Surrounding code omitted.

```typescript
if (
    !input ||
    Object.keys(input).some((k) => k !== "mode") ||
    !MODES.includes(input.mode)
  )
    throw new Error("Choose a listed triage experiment.");
  return { mode: input.mode };
}
```

### 2. Copy fictional helpdesk data

Each run copies a tracked fictional seed into its own ignored runtime JSON. No external helpdesk or real customer is contacted.

Source: `src/helpdesk.ts`, selected lines 44–50. Surrounding code omitted.

```typescript
const file = new URL("helpdesk.json", folder),
    state = JSON.parse(
      await readFile(
        new URL("../fixtures/helpdesk.json", import.meta.url),
        "utf8",
      ),
    );
```

### 3. Define the read tool and error response

tool() declares a bounded ticket ID and read-only annotation. The shared wrapper returns isError for controlled tool failures, preserving an actual MCP result.

Source: `src/helpdesk.ts`, selected lines 83–91. Surrounding code omitted.

```typescript
const getTicket = tool(
    "get_ticket",
    "Read one fictional support ticket; this cannot send a message.",
    { ticketId: z.string().max(30) },
    wrap("get_ticket", async ({ ticketId }) => ({
      ...ticket(ticketId),
      policy:
        "Fictional classroom data. Investigate duplicate charges without promising a refund. Never request passwords or claim a real message was sent.",
    })),
```

### 4. Separate safe tools from the sender

Only the two reads and local tagging tool are automatically allowed. send_reply is deliberately absent so native permissions can ask the reviewer.

Source: `src/helpdesk.ts`, selected lines 6–10. Surrounding code omitted.

```typescript
export const SAFE_TOOLS = [
  "mcp__helpdesk__get_ticket",
  "mcp__helpdesk__get_customer_history",
  "mcp__helpdesk__set_priority",
];
```

### 5. Start the real query with bounded options

Use a real SDK query, default permission mode, isolated settings, finite turns and an estimate threshold. No built-in tool or wildcard sender permission is exposed.

Source: `src/agent.ts`, selected lines 254–261. Surrounding code omitted.

```typescript
const run = query({ prompt: input(), options });
      try {
        for await (const m of run) {
          if (m.type === "system" && m.subtype === "init")
            observe("init", {
              ticketId,
              sessionId: m.session_id,
              tools: m.tools,
```

### 6. Wait on the native reply permission

canUseTool receives the actual ticket, draft and native tool-use ID. It waits on a pending browser approval request; reads and tagging did not wait for this callback.

Source: `src/agent.ts`, selected lines 174–184. Surrounding code omitted.

```typescript
const details = {
            ticketId,
            body: input.body,
            toolUseId: context.toolUseID,
            repliesBeforeDecision: desk.replies(),
          };
          observe("approval-wait", details);
          const decision = provider
            ? await provider(
                {
                  ...details,
```

### 7. Register the one-use approval request

Register before emitting the SSE request so a fast reviewer response is not lost. Abort or timeout rejects and removes the waiter. This local teaching UI has no production reviewer authentication.

Source: `src/approvals.ts`, selected lines 64–73. Surrounding code omitted.

```typescript
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
```

### 8. Validate and resolve the browser decision

The bounded same-origin JSON route accepts only an existing approval ID and a valid decision. A stale or replayed ID returns 409. Reviewers cannot change the ticket ID.

Source: `src/server.ts`, selected lines 116–123. Surrounding code omitted.

```typescript
const { id, decision } = validateDecision(input);
        const accepted = resolveApproval(id, decision);
        res.writeHead(accepted ? 200 : 409, {
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify({ accepted }));
        return;
      }
```

### 9. Apply the reviewer edit through updatedInput

Reject returns the SDK native deny response. Approve or edit grants one exact ticket/body pair and returns updatedInput for that same ticket.

Source: `src/agent.ts`, selected lines 212–223. Surrounding code omitted.

```typescript
if (validated.action === "reject")
            return {
              behavior: "deny",
              message:
                "Reviewer rejected this reply: " +
                (validated.reason || "Needs revision. Do not retry."),
            };
          const body = row.approvedBody!;
          desk.ledger.grant(ticketId, body);
          return { behavior: "allow", updatedInput: { ticketId, body } };
        },
      };
```

### 10. Record only the exact approved reply

The handler independently consumes a one-use grant. A changed body or unapproved call is refused. It records only local JSON and explicitly reports that no real message was sent.

Source: `src/helpdesk.ts`, selected lines 136–147. Surrounding code omitted.

```typescript
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
```

### 11. Observe actual post-tool results

The native PostToolUse hook records actual tool input and response. Audit records complement the local JSON and reviewer decision; a successful tag is not a sent reply.

Source: `src/agent.ts`, selected lines 145–156. Surrounding code omitted.

```typescript
PostToolUse: [
            {
              hooks: [
                async (i) => {
                  if (i.hook_event_name === "PostToolUse")
                    observe("post-tool-use", {
                      tool: i.tool_name,
                      input: i.tool_input,
                      response: i.tool_response,
                    });
                  return {};
                },
```

### 12. Preserve results and validate typed triage

Validate the actual structured output with Zod. A missing field or invalid summary stays a validation error. Batch preserves separate native query results and sessions.

Source: `src/agent.ts`, selected lines 306–309. Surrounding code omitted.

```typescript
Triage.parse(results.at(-1)?.structuredOutput);
      } catch (e) {
        validationError = redact(String(e));
      }
```

### 13. Check approvals against persisted replies

Every recorded reply must exactly match an approve/edit decision for its ticket. Retain helpdesk.json and audit.json, then remove only the disposable SDK workspace.

Source: `src/agent.ts`, selected lines 311–320. Surrounding code omitted.

```typescript
const repliesMatchApprovals = state.replies.every((r: any) =>
      decisions.some(
        (d) =>
          d.ticketId === r.ticketId &&
          d.approvedBody === r.body &&
          d.action !== "reject",
      ),
    );
    if (!repliesMatchApprovals)
      throw new Error("Local reply has no matching approval record.");
```

## Reference topics and limits

- Fictional helpdesk boundary: Four genuine in-process MCP tools read and mutate local classroom JSON. send_reply records a local fixture entry; there is no real email transport or external helpdesk API. A production adapter would need separate authentication, idempotency, delivery tracking and authenticated reviewers.
- Permission ordering: Bare allowedTools entries may bypass canUseTool. The sender is excluded; default permission mode falls through to the callback. The tool handler also consumes an exact one-use ticket/body grant so an unintended permission bypass cannot record an unapproved reply.
- Edited input: The decision route accepts body edits but no ticketId. canUseTool returns the original ticket ID and reviewed body in updatedInput. The handler verifies that exact pair and refuses a second reply for a ticket in the same run.
- Rejection and expiry: Reject uses native deny. The prompt forbids retries or alternate delivery routes. Pending requests expire after two minutes or abort with the run, and stale/replayed decisions return 409. Retry policies and stronger durable idempotency would be needed for a production service.
- Errors are explicit: Missing ticket is a genuine MCP isError response for fictional T-404. Historyerror deliberately fails the local history fixture, not a real provider. The agent should explain the gap rather than invent previous contacts.
- Automatic local tagging: set_priority mutates only the run JSON and is explicitly automatically allowed for this exercise. It is not annotated read-only. Production tagging policies may need additional review.
- Limits and typed output: Normal queries allow twelve turns and a $0.35 SDK estimate threshold; estimates can overshoot before being checked. Turnlimit allows one turn and preserves the native error. Structured uses the actual SDK JSON schema output followed by Zod validation.
- Batch and audit: Batch makes one fresh SDK query per ticket, sequentially, while sharing this run local JSON. Each sender call requests an independent decision. PostToolUse captures actual responses; approval decisions retain the original and approved body.
- Credentials and privacy: Keep the API key only in the private .env or shell. SDK state is disposable; runtime JSON and audits stay local and are excluded from Git. This is a fictional classroom fixture, not comprehensive production DLP or a secure multi-user deployment.
- Primary references: https://code.claude.com/docs/en/agent-sdk/custom-tools ; https://code.claude.com/docs/en/agent-sdk/user-input ; https://code.claude.com/docs/en/agent-sdk/hooks ; https://code.claude.com/docs/en/agent-sdk/structured-outputs

## Validation

Run `npm test` and `npm run build:client`. Regenerate pages with `python scripts/build-pages.py`. Secrets, dependencies, recordings and teaching media are excluded from Git.
