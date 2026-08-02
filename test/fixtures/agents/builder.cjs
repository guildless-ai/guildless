"use strict";
const fs = require("fs");
const path = require("path");

function arg(name) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const input = JSON.parse(fs.readFileSync(arg("input"), "utf8"));
const artifacts = [];
for (const task of input.tasks || []) {
  const file = task.file || "src/" + task.id + ".ts";
  const name = "m_" + path.basename(file).replace(/\.ts$/, "").replace(/[^a-zA-Z0-9]/g, "_");
  const code = "export function " + name + "(): number {\n  return " + name.length + ";\n}\n";
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, code, "utf8");
  artifacts.push(file);
}
fs.writeFileSync(arg("output"), JSON.stringify({ status: "ok", artifacts, summary: "built " + artifacts.length }));
