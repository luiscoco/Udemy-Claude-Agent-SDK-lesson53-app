import { mkdir, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve, join, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
export async function prepareWorkspace() {
  const parent = resolve(realpathSync.native(tmpdir()), "claude-sdk53"),
    id = randomUUID(),
    root = join(parent, id),
    cwd = join(root, "work"),
    home = join(root, "home"),
    config = join(root, "config");
  for (const p of [cwd, home, config]) await mkdir(p, { recursive: true });
  return {
    id,
    cwd,
    home,
    config,
    async cleanup() {
      const p = relative(parent, root);
      if (!p || p.startsWith("..") || isAbsolute(p))
        throw new Error("Invalid cleanup path");
      await rm(root, { recursive: true, force: true });
    },
  };
}
