const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

const ORDER_PARSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          original: { type: "string" },
          normalized: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["original", "normalized", "confidence"],
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["lines", "warnings"],
};

export function hasOpenAIConfig(env) {
  return Boolean(env.OPENAI_API_KEY);
}

export async function parseOrderTextWithAI(env, rawText) {
  return await requestOrderParse(env, [
    {
      role: "system",
      content: buildOrderParseSystemPrompt(),
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "請把下面的文字注單正規化成標準格式。",
            "只輸出符合 schema 的 JSON，不要計算支數。",
            "",
            rawText,
          ].join("\n"),
        },
      ],
    },
  ]);
}

export async function parseOrderImageWithAI(env, image) {
  return await requestOrderParse(env, [
    {
      role: "system",
      content: buildOrderParseSystemPrompt(),
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            "請辨識圖片中的注單內容，並正規化成標準注單格式。只輸出符合 schema 的 JSON，不要計算支數。",
        },
        {
          type: "input_image",
          image_url: `data:${image.contentType};base64,${image.base64}`,
          detail: "high",
        },
      ],
    },
  ]);
}

export function buildNormalizedOrderText(parseResult) {
  return normalizeAIParseResult(parseResult)
    .lines.map((line) => line.normalized.trim())
    .filter(Boolean)
    .join("\n");
}

export function normalizeAIParseResult(parseResult) {
  const safeResult =
    parseResult && typeof parseResult === "object"
      ? parseResult
      : { lines: [], warnings: ["AI 回傳格式不是物件。"] };

  const lines = Array.isArray(safeResult.lines)
    ? safeResult.lines
        .map((line) => ({
          original: String(line?.original || "").trim(),
          normalized: String(line?.normalized || "").trim(),
          confidence: Number(line?.confidence || 0),
        }))
        .filter((line) => line.normalized)
    : [];

  const warnings = Array.isArray(safeResult.warnings)
    ? safeResult.warnings.map((warning) => String(warning)).filter(Boolean)
    : [];

  return { lines, warnings };
}

async function requestOrderParse(env, input) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("尚未設定 OPENAI_API_KEY。");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      input,
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

  return normalizeAIParseResult(parseResponseOutputJson(data));
}

function buildOrderParseSystemPrompt() {
  return [
    "你是注單正規化工具，只負責把 LINE 文字或圖片中的注單轉成標準格式，不要計算支數。",
    "標準格式範例：0102x0304 二x1",
    "每一行是一組注單。",
    "號碼永遠用兩位數表示，例如 1 要輸出 01。",
    "分排符號優先保留 x；如果原文用 X、×、* 分隔排，請轉成 x。",
    "當同一行已有 x 分排時，點號 . 代表同一排內的號碼分隔，例如 10x14x17x21.31 表示 21 和 31 同排，請保留為 10x14x17x21.31。",
    "當同一行沒有 x 時，點號 . 可以代表各號碼各自一排，例如 02.03.05.08 保留為 02.03.05.08。",
    "沒有明確分排符號時，連續數字每兩位是一排，例如 0102030405 保持為 0102030405。",
    "車組請保留為 指定號碼x倍率車，例如 35x2車，不要展開全集號碼。",
    "規則區請正規化成 二x倍率、三x倍率、四x倍率；兩 等同 二。",
    "二三x1 這種合併規則可以保留。",
    "如果某一行不確定，不要猜，放到 warnings，不要輸出 normalized。",
  ].join("\n");
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
