"use strict";
const fs = require("fs");
const path = require("path");

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const input = JSON.parse(fs.readFileSync(arg("input"), "utf8"));
const workdir = input.workdir || ".";
const markerDir = path.join(workdir, ".guildless", "fixtures");
fs.mkdirSync(markerDir, { recursive: true });
const files = [];
for (const finding of input.findings || []) {
  if (finding.kind === "verify") {
    fs.writeFileSync(path.join(markerDir, ".verify-fixed"), "ok", "utf8");
    files.push("verify marker");
  } else if (finding.file) {
    fs.writeFileSync(path.join(markerDir, ".fixed-" + path.basename(finding.file)), "ok", "utf8");
    files.push(finding.file);
  }
}
fs.writeFileSync(arg("output"), JSON.stringify({ status: "ok", files, summary: "fixed " + files.length }));
