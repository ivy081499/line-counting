import fs from "node:fs";
import path from "node:path";
import {
  OUTPUT_DIR,
  caseToTrainingExample,
  readCases,
} from "./shared.js";

const TEST_RATIO = Number(process.env.AI_TRAINING_TEST_RATIO || 0.2);

const cases = readCases().sort((a, b) => a.id.localeCompare(b.id));

if (cases.length === 0) {
  throw new Error("沒有找到任何訓練案例。請先在 ai-training/cases/ 新增 JSON。");
}

const validationCount =
  cases.length > 1 ? Math.max(1, Math.round(cases.length * TEST_RATIO)) : 0;
const trainingCount = cases.length - validationCount;
const trainingCases = cases.slice(0, trainingCount);
const validationCases = cases.slice(trainingCount);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

writeJsonl(
  path.join(OUTPUT_DIR, "training.jsonl"),
  trainingCases.map(caseToTrainingExample)
);
writeJsonl(
  path.join(OUTPUT_DIR, "validation.jsonl"),
  validationCases.map(caseToTrainingExample)
);

console.log(`Cases: ${cases.length}`);
console.log(`Training: ${trainingCases.length}`);
console.log(`Validation: ${validationCases.length}`);
console.log(`Wrote ${path.join(OUTPUT_DIR, "training.jsonl")}`);
console.log(`Wrote ${path.join(OUTPUT_DIR, "validation.jsonl")}`);

function writeJsonl(file, rows) {
  const content = rows.map((row) => JSON.stringify(row)).join("\n");
  fs.writeFileSync(file, content ? `${content}\n` : "", "utf8");
}
