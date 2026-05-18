import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const TRAINING_DIR = path.resolve(SCRIPT_DIR, "..");
export const PROJECT_DIR = path.resolve(TRAINING_DIR, "..");
export const CASES_DIR = path.join(TRAINING_DIR, "cases");
export const OUTPUT_DIR = path.join(TRAINING_DIR, "output");

export const ORDER_PARSE_SCHEMA = {
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

export function buildSystemPrompt() {
  return [
    "你是注單解析工具，負責把 LINE 文字或圖片中的注單轉成標準 JSON。",
    "只輸出 JSON，不要輸出解釋文字。",
    "JSON 格式固定為：{\"lines\":[{\"original\":\"原始片段\",\"normalized\":\"標準注單\",\"confidence\":0.95}],\"warnings\":[]}",
    "標準注單格式為：號碼區 玩法x倍率 玩法x倍率 ...",
    "玩法只使用 二、三、四、車。",
    "號碼一律兩位數；單位數補 0。",
    "×、X、*、手寫交叉分組符都正規化為 x。",
    "二三x1、二三四x1、2-3x0.5 這類共用倍率要展開成 二x1 三x1 或 二x0.5 三x0.5。",
    "車組輸出為 號碼x倍率車，例如 33x0.65車。",
    "彩種標記如 539 不要當成下注號碼。",
    "539 全部數字表示 01 到 39；若題目寫扣除某排號碼，請從 01-39 移除那些兩位數後再展開輸出。",
    "N尾表示 539 中個位數為 N 的號碼，例如 4尾是 04142434，7尾是 07172737，0尾是 102030；若尾數清單中間寫省略，表示連續尾數都要各自展開。",
    "圖片中直式多欄號碼通常依欄讀；下方共同玩法倍率套用到每一欄。",
  ].join("\n");
}

export function readCases() {
  const files = listJsonFiles(CASES_DIR);
  return files.map((file) => {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    return normalizeCase(json, file);
  });
}

export function caseToTrainingExample(testCase) {
  const messages = [
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    {
      role: "user",
      content: buildUserContent(testCase),
    },
    {
      role: "assistant",
      content: JSON.stringify({
        lines: testCase.lines,
        warnings: testCase.warnings,
      }),
    },
  ];

  return { messages };
}

export function buildUserContent(testCase) {
  if (testCase.type === "text") {
    return [
      "請解析下面的文字注單，輸出標準 JSON。",
      "",
      testCase.input,
    ].join("\n");
  }

  const image = buildImageContent(testCase);
  return [
    {
      type: "text",
      text: "請辨識圖片中的注單內容，並輸出標準 JSON。",
    },
    {
      type: "image_url",
      image_url: image,
    },
  ];
}

export function buildResponsesInput(testCase) {
  return [
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    {
      role: "user",
      content:
        testCase.type === "text"
          ? [
              {
                type: "input_text",
                text: buildUserContent(testCase),
              },
            ]
          : [
              {
                type: "input_text",
                text: "請辨識圖片中的注單內容，並輸出標準 JSON。",
              },
              {
                type: "input_image",
                image_url: buildImageContent(testCase).url,
                detail: testCase.image.detail || "high",
              },
            ],
    },
  ];
}

export function expectedNormalizedLines(testCase) {
  return testCase.lines.map((line) => line.normalized.trim()).filter(Boolean);
}

export function actualNormalizedLines(parseResult) {
  return Array.isArray(parseResult?.lines)
    ? parseResult.lines
        .map((line) => String(line?.normalized || "").trim())
        .filter(Boolean)
    : [];
}

function buildImageContent(testCase) {
  const detail = testCase.image.detail || "high";

  if (testCase.image.url) {
    return { url: testCase.image.url, detail };
  }

  const imagePath = path.resolve(path.dirname(testCase.file), testCase.image.path);
  const contentType = testCase.image.contentType || inferContentType(imagePath);
  const base64 = fs.readFileSync(imagePath).toString("base64");

  return {
    url: `data:${contentType};base64,${base64}`,
    detail,
  };
}

function normalizeCase(testCase, file) {
  const id = String(testCase.id || path.basename(file, ".json"));
  const type = testCase.type;

  if (!["text", "image"].includes(type)) {
    throw new Error(`${file}: type 必須是 text 或 image。`);
  }

  if (type === "text" && typeof testCase.input !== "string") {
    throw new Error(`${file}: text case 需要 input 字串。`);
  }

  if (type === "image") {
    if (!testCase.image || (!testCase.image.path && !testCase.image.url)) {
      throw new Error(`${file}: image case 需要 image.path 或 image.url。`);
    }
  }

  if (!Array.isArray(testCase.lines) || testCase.lines.length === 0) {
    throw new Error(`${file}: lines 至少需要一筆正解。`);
  }

  const lines = testCase.lines.map((line, index) => {
    const normalized = String(line?.normalized || "").trim();
    if (!normalized) {
      throw new Error(`${file}: lines[${index}].normalized 不可空白。`);
    }

    return {
      original: String(line?.original || "").trim(),
      normalized,
      confidence: Number(line?.confidence ?? 0.95),
    };
  });

  const warnings = Array.isArray(testCase.warnings)
    ? testCase.warnings.map((warning) => String(warning))
    : [];

  return {
    ...testCase,
    id,
    type,
    lines,
    warnings,
    file,
  };
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listJsonFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
    })
    .sort();
}

function inferContentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}
