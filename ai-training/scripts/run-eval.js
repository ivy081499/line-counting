import {
  ORDER_PARSE_SCHEMA,
  actualNormalizedLines,
  buildResponsesInput,
  expectedNormalizedLines,
  readCases,
} from "./shared.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-2024-08-06";

if (!OPENAI_API_KEY) {
  throw new Error("請先設定 OPENAI_API_KEY。");
}

const cases = readCases();

let passed = 0;

for (const testCase of cases) {
  const parseResult = await requestParse(testCase);
  const expected = expectedNormalizedLines(testCase);
  const actual = actualNormalizedLines(parseResult);
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  if (ok) {
    passed += 1;
    console.log(`PASS ${testCase.id}`);
    continue;
  }

  console.log(`FAIL ${testCase.id}`);
  console.log("Expected:");
  console.log(expected.join("\n"));
  console.log("Actual:");
  console.log(actual.join("\n"));
}

console.log(`\n${passed}/${cases.length} cases passed.`);

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

  return parseResponseOutputJson(data);
}

function parseResponseOutputJson(data) {
  if (data.output_text) {
    return JSON.parse(data.output_text);
  }

  const outputText = (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("");

  if (!outputText) {
    throw new Error("OpenAI 沒有回傳可解析文字。");
  }

  return JSON.parse(outputText);
}
