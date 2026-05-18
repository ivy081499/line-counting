import {
  OUTPUT_DIR,
  ORDER_PARSE_SCHEMA,
  actualNormalizedLines,
  buildResponsesInput,
  expectedNormalizedLines,
  readCases,
} from "./shared.js";
import fs from "node:fs";
import path from "node:path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-2024-08-06";
const AI_EVAL_CASES = parseCsvEnv(process.env.AI_EVAL_CASES);
const AI_EVAL_TYPE = process.env.AI_EVAL_TYPE || "";
const AI_EVAL_LIMIT = Number(process.env.AI_EVAL_LIMIT || 0);

if (!OPENAI_API_KEY) {
  throw new Error("請先設定 OPENAI_API_KEY。");
}

const cases = selectCases(readCases());

let passed = 0;
let failed = 0;
let errored = 0;
const report = [];

for (const testCase of cases) {
  let parseResult;

  try {
    parseResult = await requestParse(testCase);
  } catch (error) {
    errored += 1;
    console.log(`ERROR ${testCase.id}`);
    console.log(error.message);
    report.push({
      id: testCase.id,
      type: testCase.type,
      status: "error",
      error: error.message,
      expected: expectedNormalizedLines(testCase),
      actual: [],
    });
    continue;
  }

  const expected = expectedNormalizedLines(testCase);
  const actual = actualNormalizedLines(parseResult);
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  if (ok) {
    passed += 1;
    console.log(`PASS ${testCase.id}`);
    report.push({
      id: testCase.id,
      type: testCase.type,
      status: "pass",
      expected,
      actual,
      warnings: parseResult.warnings || [],
    });
    continue;
  }

  failed += 1;
  console.log(`FAIL ${testCase.id}`);
  console.log("Expected:");
  console.log(expected.join("\n"));
  console.log("Actual:");
  console.log(actual.join("\n"));
  report.push({
    id: testCase.id,
    type: testCase.type,
    status: "fail",
    expected,
    actual,
    warnings: parseResult.warnings || [],
  });
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const reportFile = path.join(OUTPUT_DIR, "eval-report.json");
fs.writeFileSync(
  reportFile,
  JSON.stringify(
    {
      model: OPENAI_MODEL,
      total: cases.length,
      passed,
      failed,
      errored,
      report,
    },
    null,
    2
  ),
  "utf8"
);

console.log(`\n${passed}/${cases.length} cases passed.`);
console.log(`Failed: ${failed}`);
console.log(`Errored: ${errored}`);
console.log(`Report: ${reportFile}`);

async function requestParse(testCase) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: buildResponsesInput(testCase),
      text: {
        format: {
          type: "json_schema",
          name: "order_parse_result",
          strict: true,
          schema: ORDER_PARSE_SCHEMA,
        },
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI 解析失敗。");
  }

  return parseResponseOutputJson(data, testCase.id);
}

function parseResponseOutputJson(data, caseId) {
  if (data.output_text) {
    return JSON.parse(data.output_text);
  }

  const outputText = (data.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || content.output_text || "")
    .filter(Boolean)
    .join("");

  if (!outputText) {
    throw new Error(
      [
        "OpenAI 沒有回傳可解析文字。",
        `case: ${caseId}`,
        `response: ${JSON.stringify(summarizeResponse(data))}`,
      ].join("\n")
    );
  }

  return JSON.parse(outputText);
}

function summarizeResponse(data) {
  return {
    id: data.id,
    status: data.status,
    error: data.error,
    incomplete_details: data.incomplete_details,
    output: (data.output || []).map((item) => ({
      id: item.id,
      type: item.type,
      role: item.role,
      status: item.status,
      content: (item.content || []).map((content) => ({
        type: content.type,
        text: content.text
          ? `${content.text.slice(0, 500)}${content.text.length > 500 ? "..." : ""}`
          : undefined,
        refusal: content.refusal,
      })),
    })),
  };
}

function selectCases(allCases) {
  let selected = allCases;

  if (AI_EVAL_CASES.length > 0) {
    const ids = new Set(AI_EVAL_CASES);
    selected = selected.filter((testCase) => ids.has(testCase.id));
  }

  if (AI_EVAL_TYPE) {
    selected = selected.filter((testCase) => testCase.type === AI_EVAL_TYPE);
  }

  if (AI_EVAL_LIMIT > 0) {
    selected = selected.slice(0, AI_EVAL_LIMIT);
  }

  if (selected.length === 0) {
    throw new Error("沒有符合 AI_EVAL_* 條件的案例。");
  }

  return selected;
}

function parseCsvEnv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
