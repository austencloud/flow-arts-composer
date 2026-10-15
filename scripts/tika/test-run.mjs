// Simple test to verify the evaluation framework works
import fs from "fs";
import path from "path";

const PROJECT_ROOT = process.cwd();

console.log("=== TIKA Evaluation Test ===");
console.log("Project root:", PROJECT_ROOT);

// The scenarios run-evaluation.mjs loads
const scenariosPath = path.join(PROJECT_ROOT, "scripts/tika/scenarios.json");
console.log("Scenarios file exists:", fs.existsSync(scenariosPath));

if (fs.existsSync(scenariosPath)) {
  const scenarios = JSON.parse(fs.readFileSync(scenariosPath, "utf-8"));
  console.log("Scenarios:", scenarios.length);
}

// Check if knowledge graph exists
const graphPath = path.join(
  PROJECT_ROOT,
  "src/lib/features/tika/knowledge/semantic-graph.ts"
);
console.log("Knowledge graph exists:", fs.existsSync(graphPath));

// Glossary and letter types are generated from @tka/domain by scripts/sync-mcp-data.mjs
const glossaryPath = path.join(
  PROJECT_ROOT,
  "mcp-server-pkg/data/tka-glossary.json"
);
console.log("Glossary exists:", fs.existsSync(glossaryPath));

if (fs.existsSync(glossaryPath)) {
  const glossary = JSON.parse(fs.readFileSync(glossaryPath, "utf-8"));
  console.log("Glossary terms:", Object.keys(glossary).length);
}

const typesPath = path.join(
  PROJECT_ROOT,
  "mcp-server-pkg/data/letter-types.json"
);
console.log("Letter types exists:", fs.existsSync(typesPath));

if (fs.existsSync(typesPath)) {
  const types = JSON.parse(fs.readFileSync(typesPath, "utf-8"));
  console.log("Letter types:", Object.keys(types).length);
}

// Reachability only. The endpoint checks sign-in before anything else, and this
// sends no token and no question, so it can never start a paid model call.
// A real answer needs TIKA_ID_TOKEN; see docs/reference/tika-testing.md.
console.log("\n=== Checking Dev Server ===");
try {
  const response = await fetch("https://localhost:5173/api/tika/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const data = await response.json().catch(() => ({}));

  console.log("Dev server: RUNNING");
  console.log(`TIKA endpoint: ${response.status} ${data.error ?? ""}`.trim());
} catch (err) {
  console.log("Dev server: NOT RUNNING or error");
  console.log("Error:", err.message);
}

console.log("\n=== Test Complete ===");
