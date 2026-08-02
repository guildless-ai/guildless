import { readInput, writeOutput } from "./agent-io.js";

const input = readInput();
const objective = typeof input.objective === "string" ? input.objective : "completion";
const tasks = [
  { id: "gate-1", title: `${objective} - gate 1`, file: "src/runtime/gate-1.ts" },
  { id: "gate-2", title: `${objective} - gate 2`, file: "src/runtime/gate-2.ts" },
  { id: "gate-3", title: `${objective} - gate 3`, file: "src/runtime/gate-3.ts" }
];
writeOutput({ status: "ok", tasks });
