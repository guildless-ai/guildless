"use strict";
let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  const input = JSON.parse(data);
  if (!input.role || !input.workspace || !input.runId) {
    process.stdout.write(JSON.stringify({ status: "error", error: "missing injected runId/role/workspace" }));
    return;
  }
  const files = (process.env.PLANNER_FILES || "src/task-a.ts,src/task-b.ts")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const tasks = files.map((file, index) => ({
    id: "task-" + file.replace(/[^a-zA-Z0-9]/g, "_"),
    title: "module " + (index + 1),
    file
  }));
  process.stdout.write(JSON.stringify({ status: "ok", tasks }));
});
