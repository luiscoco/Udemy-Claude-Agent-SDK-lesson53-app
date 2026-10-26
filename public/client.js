import { renderMarkdown } from "./markdown.js";
const $ = (id) => document.getElementById(id);
let data = {}, rows = [], pending = null;
let events = [];
function json(id, v) {
    $(id).textContent = JSON.stringify(v, null, 2);
    window.Prism?.highlightElement($(id));
}
function table(id, records) {
    $(id).replaceChildren(...records.map((values) => {
        const tr = document.createElement("tr");
        for (const v of values) {
            const td = document.createElement("td");
            td.textContent = String(v ?? "");
            tr.append(td);
        }
        return tr;
    }));
}
function draw() {
    const handlers = data.handlers || [], decisions = data.decisions || [];
    $("span-count").textContent = String(handlers.filter((h) => h.name === "set_priority" && h.ok).length);
    $("metric-count").textContent = String(decisions.length);
    $("log-count").textContent = String(data.state?.replies?.length || 0);
    table("trace-history", handlers.map((h) => [
        h.name,
        JSON.stringify(h.input),
        h.ok,
        JSON.stringify(h.output),
    ]));
    table("metric-history", decisions.map((d) => [
        d.ticketId,
        d.action,
        d.originalBody,
        d.approvedBody || d.reason || "No reply recorded",
    ]));
    const filter = $("user-filter").value.trim();
    table("log-history", (data.observations || [])
        .filter((o) => o.kind === "post-tool-use" && (!filter || o.detail.tool === filter))
        .map((o) => [
        o.detail.tool,
        JSON.stringify(o.detail.input),
        JSON.stringify(o.detail.response),
    ]));
    json("requests", data.tools || []);
    json("telemetry", data.observations || []);
}
function approval(request) {
    pending = request;
    $("approval-panel").hidden = false;
    $("approval-title").textContent = "Review reply for " + request.ticketId;
    $("approval-body").textContent = request.body;
    $("edited-body").value = request.body;
    $("approval-meta").textContent =
        "Recorded replies before this decision: " +
            request.repliesBeforeDecision +
            ". Nothing is recorded until you approve. Expires: " +
            new Date(request.deadline).toLocaleTimeString();
    $("approval-feedback").textContent =
        "Choose Approve, Edit and approve, or Reject. Local classroom review only.";
    for (const id of ["approve", "edit", "reject"])
        $(id).disabled = false;
}
async function decide(action) {
    if (!pending)
        return;
    const request = pending;
    for (const id of ["approve", "edit", "reject"])
        $(id).disabled = true;
    try {
        const response = await fetch("/api/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: request.id,
                action,
                ...(action === "edit"
                    ? { body: $("edited-body").value }
                    : {}),
                ...(action === "reject"
                    ? { reason: "Classroom reviewer requested a revision. Do not retry." }
                    : {}),
            }),
        });
        if (!response.ok)
            throw new Error(await response.text());
        pending = null;
        $("approval-feedback").textContent =
            "Decision accepted: " +
                action +
                ". Waiting for the actual SDK tool result.";
    }
    catch (e) {
        $("approval-feedback").textContent = String(e);
        for (const id of ["approve", "edit", "reject"])
            $(id).disabled = false;
    }
}
for (const id of ["approve", "edit", "reject"])
    $(id).onclick = () => decide(id);
$("user-filter").addEventListener("input", draw);
$("run").onclick = async () => {
    const button = $("run");
    button.disabled = true;
    rows = [];
    events = [];
    data = {};
    pending = null;
    $("approval-panel").hidden = true;
    draw();
    $("conversation").replaceChildren();
    json("evidence", {});
    $("status").textContent =
        "Reading and tagging fictional tickets. Watch for a reply approval request.";
    try {
        const response = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: $("mode").value }),
        });
        if (!response.ok)
            throw new Error(await response.text());
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = "", text = "";
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            let n;
            while ((n = buffer.indexOf("\n\n")) >= 0) {
                const frame = buffer.slice(0, n);
                buffer = buffer.slice(n + 2);
                if (!frame.startsWith("data: "))
                    continue;
                const event = JSON.parse(frame.slice(6));
                events.push(event);
                if (event.type === "text") {
                    text += event.text + "\n\n";
                    renderMarkdown($("conversation"), text);
                }
                if (event.type === "observation") {
                    rows.push(event.observation);
                    data.observations = rows;
                    if (event.observation.kind === "query-options")
                        json("options", event.observation.detail);
                    if (event.observation.kind === "handler")
                        (data.handlers ||= []).push(event.observation.detail);
                    draw();
                }
                if (event.type === "result")
                    json("native-result", event.result);
                if (event.type === "approval-request") {
                    approval(event.request);
                    $("status").textContent =
                        "Paused: review the draft and choose a decision below.";
                }
                if (event.type === "approval-resolved") {
                    (data.decisions ||= []).push(event.decision);
                    draw();
                }
                if (event.type === "evidence") {
                    data = event.evidence;
                    draw();
                    json("evidence", data);
                    json("storage", {
                        file: data.savedFile,
                        tickets: data.state.tickets,
                        replies: data.state.replies,
                        repliesMatchApprovals: data.repliesMatchApprovals,
                        pendingApprovals: data.pendingApprovals,
                        scope: data.scope,
                    });
                    json("diagnostics", {
                        exception: data.exception,
                        validationError: data.validationError,
                        results: data.results,
                    });
                }
                if (event.type === "error")
                    throw new Error(event.text);
            }
        }
        $("status").textContent =
            "Finished. Inspect the actual local state, approval decisions and SDK result.";
    }
    catch (e) {
        $("status").textContent = String(e);
    }
    finally {
        button.disabled = false;
        pending = null;
    }
};
fetch("/api/config")
    .then((r) => r.json())
    .then((c) => {
    $("configuration").textContent = "Ready: " + c.model;
    $("run").disabled = !c.ready;
    if (!c.ready)
        $("status").textContent =
            "Configure your API key privately in .env and restart. Open How to run.";
});
draw();
$("download").onclick = () => {
    const u = URL.createObjectURL(new Blob([JSON.stringify(events, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = u;
    a.download = "lesson53-native-observations.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
};
