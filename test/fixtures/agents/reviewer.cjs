"use strict";
const fs = require("fs");
const path = require("path");

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const input = JSON.parse(fs.readFileSync(arg("input"), "utf8"));
const findings = [];
for (const artifact of input.artifacts || []) {
  if (artifact.includes("task-a")) {
    const marker = path.join(input.workdir || ".", ".guildless", "fixtures", ".fixed-" + path.basename(artifact));
    if (!fs.existsSync(marker)) {
      findings.push({
        id: artifact + "#1",
        target: artifact,
        focus: input.focus || "general",
        severity: "medium",
        message: "task-a module lacks a coverage marker",
        file: artifact,
        line: 1
      });
    }
  }
}
fs.writeFileSync(arg("output"), JSON.stringify({ status: "ok", findings }));
