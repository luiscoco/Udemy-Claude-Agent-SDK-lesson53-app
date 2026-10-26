import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { runAgent, validateConfig } from "./agent.js";
const terminal = createInterface({ input: stdin, output: stdout });
try {
  await runAgent(
    validateConfig({ mode: process.argv[2] || "approve" }),
    (e) => {
      if (e.type === "evidence") console.log(JSON.stringify(e));
    },
    new AbortController(),
    async (request) => {
      console.log(
        `Local fictional reply for ${request.ticketId}:\n${request.body}`,
      );
      const answer = (
        await terminal.question("Approve (a), Edit (e), or Reject (r)? ")
      )
        .trim()
        .toLowerCase();
      if (answer === "a") return { action: "approve" };
      if (answer === "e")
        return {
          action: "edit",
          body: await terminal.question("Enter the replacement body: "),
        };
      return { action: "reject", reason: "Rejected in the terminal." };
    },
  );
} finally {
  terminal.close();
}
