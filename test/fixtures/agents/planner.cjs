"use strict";
const fs = require("fs");
const path = require("path");

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const input = JSON.parse(fs.readFileSync(arg("input"), "utf8"));
const files = (process.env.PLANNER_FILES || "src/task-a.ts,src/task-b.ts")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const tasks = files.map((file, index) => ({
  id: "task-" + path.basename(file).replace(/\.ts$/, ""),
  title: "module " + (index + 1),
  file
}));
fs.writeFileSync(arg("output"), JSON.stringify({ status: "ok", tasks }));
