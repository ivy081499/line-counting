// src/constants.js
var COMMANDS = {
  SELECT_FRIEND_FOR_BET: "選朋友下單",
  ADD_FRIEND: "新增朋友",
  DELETE_FRIEND: "刪除朋友",
  FRIEND_LIST: "查看朋友列表",
  TODAY_ORDERS: "今日注單",
  PAST_ORDERS: "過往注單",
  FRIEND_MANAGEMENT: "朋友管理",
  COST_MANAGEMENT: "成本管理",
  HELP: "說明"
};
var INTERNAL_COMMANDS = {
  SELECT_FRIEND_PREFIX: "#",
  DELETE_FRIEND_PREFIX: "!刪除朋友:",
  CONFIRM_DELETE_FRIEND_PREFIX: "!確認刪除朋友:",
  CANCEL_DELETE_FRIEND: "!取消刪除朋友",
  ORDER_REPORT_PREFIX: "!注單報表:",
  PAST_ORDER_DATE_PREFIX: "!過往注單日期:",
  COST_MANAGEMENT_PREFIX: "!成本管理:",
  VIEW_COST_PREFIX: "!查看成本:",
  EDIT_COST_PREFIX: "!編輯成本:",
  APPLY_DEFAULT_COST_PREFIX: "!套用預設成本:",
  MANUAL_EDIT_COST_PREFIX: "!手動編輯成本:"
};
var PENDING_ACTIONS = {
  ADD_FRIEND: "add_friend",
  PAST_ORDER_DATE: "past_order_date",
  EDIT_COST_PREFIX: "edit_cost:"
};
var COST_GAME_TYPES = ["539", "大樂透", "港號"];
var DEFAULT_CAR_GAME_MAX_NUMBER = 39;
var DEFAULT_COST_VALUES_BY_GAME = {
  "539": [70, 75, 80, 70],
  "大樂透": [70, 75, 80, 70],
  "港號": [70, 75, 80, 70]
};
var DEFAULT_COST_ROWS = COST_GAME_TYPES.map(
  (gameType) => {
    const values = DEFAULT_COST_VALUES_BY_GAME[gameType];
    return {
      gameType,
      star2Cost: values[0],
      star3Cost: values[1],
      star4Cost: values[2],
      carCost: values[3]
    };
  }
);

// src/aiParser.js
var DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
var ORDER_PARSE_SCHEMA = {
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
          confidence: { type: "number" }
        },
        required: ["original", "normalized", "confidence"]
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["lines", "warnings"]
};
function hasOpenAIConfig(env) {
  return Boolean(env.OPENAI_API_KEY);
}
async function parseOrderTextWithAI(env, rawText) {
  return await requestOrderParse(env, [
    {
      role: "system",
      content: buildOrderParseSystemPrompt()
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
            rawText
          ].join("\n")
        }
      ]
    }
  ]);
}
async function parseOrderImageWithAI(env, image) {
  return await requestOrderParse(env, [
    {
      role: "system",
      content: buildOrderParseSystemPrompt()
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: "請辨識圖片中的注單內容，並正規化成標準注單格式。只輸出符合 schema 的 JSON，不要計算支數。"
        },
        {
          type: "input_image",
          image_url: `data:${image.contentType};base64,${image.base64}`,
          detail: "high"
        }
      ]
    }
  ]);
}
function buildNormalizedOrderText(parseResult) {
  return normalizeAIParseResult(parseResult).lines.map((line) => line.normalized.trim()).filter(Boolean).join("\n");
}
function normalizeAIParseResult(parseResult) {
  const safeResult = parseResult && typeof parseResult === "object" ? parseResult : { lines: [], warnings: ["AI 回傳格式不是物件。"] };
  const lines = Array.isArray(safeResult.lines) ? safeResult.lines.map((line) => ({
    original: String(line?.original || "").trim(),
    normalized: String(line?.normalized || "").trim(),
    confidence: Number(line?.confidence || 0)
  })).filter((line) => line.normalized) : [];
  const warnings = Array.isArray(safeResult.warnings) ? safeResult.warnings.map((warning) => String(warning)).filter(Boolean) : [];
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
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "order_parse_result",
          strict: true,
          schema: ORDER_PARSE_SCHEMA
        }
      }
    })
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
    "如果某一行不確定，不要猜，放到 warnings，不要輸出 normalized。"
  ].join("\n");
}
function parseResponseOutputJson(data) {
  if (data.output_text) {
    return JSON.parse(data.output_text);
  }
  const outputText = (data.output || []).flatMap((item) => item.content || []).filter((content) => content.type === "output_text").map((content) => content.text).join("");
  if (!outputText) {
    throw new Error("OpenAI 沒有回傳可解析文字。");
  }
  return JSON.parse(outputText);
}

// src/costs.js
function parseCostCsvLine(gameType, text) {
  const values = String(text || "").trim().split(",").map((value) => value.trim());
  const exampleText = formatCostValues(DEFAULT_COST_VALUES_BY_GAME[gameType]);
  if (values.length !== 4) {
    throw new Error(`請輸入四個用逗號分隔的數字，例如 ${exampleText}`);
  }
  const numbers = values.map((value) => Number(value));
  if (numbers.some((value) => Number.isNaN(value))) {
    throw new Error(`成本只能包含數字與逗號，例如 ${exampleText}`);
  }
  return buildCostRowFromValues(gameType, numbers);
}
function buildCostRowFromValues(gameType, values) {
  return {
    gameType,
    star2Cost: values[0],
    star3Cost: values[1],
    star4Cost: values[2],
    carCost: values[3]
  };
}
function formatCostValues(values) {
  return values.join(",");
}
function buildEditCostPendingAction(friendId, gameIndex, costRows) {
  return `${PENDING_ACTIONS.EDIT_COST_PREFIX}${friendId}:${gameIndex}:${encodeURIComponent(
    JSON.stringify(costRows)
  )}`;
}
function parseEditCostPendingAction(pendingAction) {
  const payload = pendingAction.slice(PENDING_ACTIONS.EDIT_COST_PREFIX.length);
  const [friendIdText, gameIndexText, encodedRows = "%5B%5D"] = payload.split(":");
  return {
    friendId: Number(friendIdText),
    gameIndex: Number(gameIndexText),
    costRows: JSON.parse(decodeURIComponent(encodedRows))
  };
}

// src/lineContent.js
async function downloadLineImage(env, messageId) {
  const response = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: {
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`
      }
    }
  );
  if (!response.ok) {
    throw new Error("下載 LINE 圖片失敗。");
  }
  return {
    contentType: response.headers.get("content-type") || "image/jpeg",
    base64: arrayBufferToBase64(await response.arrayBuffer())
  };
}
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

// src/utils.js
function formatPickLabel(pick) {
  const labels = {
    1: "一",
    2: "二",
    3: "三",
    4: "四",
    5: "五",
    6: "六",
    7: "七",
    8: "八",
    9: "九",
    10: "十",
    car: "車"
  };
  return labels[pick] || String(pick);
}
function formatNumber(value) {
  return Number(value.toFixed(4)).toString();
}
function parseDateFriendPayload(payload) {
  const [dateText = "", ...friendNameParts] = String(payload || "").split("|");
  return {
    dateText: dateText.trim(),
    friendName: friendNameParts.join("|").trim()
  };
}
function isValidDateText(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false;
  const date = /* @__PURE__ */ new Date(`${dateText}T00:00:00+08:00`);
  return !Number.isNaN(date.getTime()) && getTaipeiDateString(date) === dateText;
}
function addDaysToTaipeiDate(days) {
  const now = /* @__PURE__ */ new Date();
  const taipeiNoon = /* @__PURE__ */ new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now) + "T12:00:00+08:00"
  );
  taipeiNoon.setUTCDate(taipeiNoon.getUTCDate() + days);
  return getTaipeiDateString(taipeiNoon);
}
function getTaipeiDateString(date = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}
function isAllowedUser(userId, allowedUserIds) {
  if (!userId || !allowedUserIds) return false;
  return allowedUserIds.split(",").map((id) => id.trim()).includes(userId);
}

// src/reports.js
function buildCalculationReport(friendName, entries, imageCount = 0, dateText = getTaipeiDateString()) {
  const totals = { 2: 0, 3: 0, 4: 0, car: 0 };
  const lines = [`${friendName} ${dateText} 報表`, ""];
  if (entries.length === 0) {
    lines.push("今天沒有可計算的文字資料。");
  }
  for (const [index, entry] of entries.entries()) {
    if (entry.errorMessage) {
      lines.push(`${index + 1}. ${entry.sourceLineText}`);
      lines.push(`   無法解析：${entry.errorMessage}`);
      continue;
    }
    const calculationTexts = entry.calculations.map((calculation) => {
      if (totals[calculation.pick] !== void 0) {
        totals[calculation.pick] += calculation.amount;
      }
      return `${formatPickLabel(calculation.pick)}${formatNumber(
        calculation.amount
      )}`;
    });
    lines.push(
      `${index + 1}. ${entry.sourceLineText}：${calculationTexts.join("、")}`
    );
  }
  lines.push("");
  lines.push("加總");
  lines.push(
    [
      `二${formatNumber(totals[2])}`,
      `三${formatNumber(totals[3])}`,
      `四${formatNumber(totals[4])}`,
      `車${formatNumber(totals.car)}`
    ].join(
      "、"
    )
  );
  if (imageCount > 0) {
    lines.push("");
    lines.push(`圖片 ${imageCount} 筆尚未解析。`);
  }
  return lines.join("\n");
}
function buildCostReport(friendName, costs) {
  const lines = [`${friendName} 成本設定`, ""];
  if (costs.length === 0) {
    lines.push("目前尚未設定成本。查看成本時會自動套用預設成本。");
    return lines.join("\n");
  }
  for (const cost of costs) {
    lines.push(
      [
        cost.game_type,
        `二${formatNumber(cost.star2_cost)}`,
        `三${formatNumber(cost.star3_cost)}`,
        `四${formatNumber(cost.star4_cost)}`,
        `車${formatNumber(cost.car_cost)}`
      ].join(" ")
    );
  }
  return lines.join("\n");
}

// src/calculations.js
function parseTextToCalculationEntries(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(parseCalculationLine);
}
function parseCalculationLine(line) {
  const carEntry = parseCarCalculationLine(line);
  if (carEntry) return carEntry;
  const parts = line.split(/\s+/);
  const numberPart = parts[0] || "";
  const rulePart = parts.slice(1).join(" ");
  const entry = {
    sourceLineText: line,
    numberPart,
    rulePart,
    rows: [],
    calculations: [],
    totalAmount: 0,
    errorMessage: null
  };
  try {
    if (!numberPart || !rulePart) {
      throw new Error("缺少號碼區或規則區");
    }
    const rows = parseNumberRows(numberPart);
    const rules = parseCalculationRules(rulePart);
    entry.rows = rows;
    entry.calculations = rules.flatMap(
      (rule) => rule.picks.map((pick) => {
        const baseCount = calculateRowCombinationCount(rows, pick);
        const amount = baseCount * rule.multiplier;
        return {
          pick,
          baseCount,
          multiplier: rule.multiplier,
          amount
        };
      })
    );
    entry.totalAmount = entry.calculations.reduce(
      (total, calculation) => total + calculation.amount,
      0
    );
  } catch (error) {
    entry.errorMessage = error.message;
  }
  return entry;
}
function parseCarCalculationLine(line) {
  const normalized = String(line).trim().replace(/[×＊*]/g, "x").replace(/X/g, "x");
  const match = normalized.match(/^(\d{1,2})\s*x\s*([0-9]+(?:\.[0-9]+)?)\s*車$/);
  if (!match) return null;
  const targetNumber = match[1].padStart(2, "0");
  const multiplier = Number(match[2]);
  const allNumbers = buildGameNumbers(DEFAULT_CAR_GAME_MAX_NUMBER);
  const otherNumbers = allNumbers.filter((number) => number !== targetNumber);
  const rows = [[targetNumber], otherNumbers];
  const baseCount = otherNumbers.length;
  const amount = baseCount * multiplier;
  return {
    sourceLineText: line,
    numberPart: targetNumber,
    rulePart: `車x${match[2]}`,
    rows,
    calculations: [
      {
        pick: "car",
        baseCount,
        multiplier,
        amount
      }
    ],
    totalAmount: amount,
    errorMessage: allNumbers.includes(targetNumber) ? null : `車組號碼超出 539 範圍：${targetNumber}`
  };
}
function buildGameNumbers(maxNumber) {
  const numbers = [];
  for (let number = 1; number <= maxNumber; number += 1) {
    numbers.push(String(number).padStart(2, "0"));
  }
  return numbers;
}
function parseNumberRows(numberPart) {
  const normalized = String(numberPart).trim().replace(/[×＊*]/g, "x").replace(/X/g, "x");
  const rowTexts = normalized.includes("x") ? normalized.split(/x+/).filter(Boolean) : normalized.includes(".") ? normalized.split(/\.+/).filter(Boolean) : splitIntoTwoDigitNumbers(normalized);
  const rows = rowTexts.map((rowText) => splitIntoTwoDigitNumbers(rowText));
  if (rows.length === 0 || rows.some((row) => row.length === 0)) {
    throw new Error("號碼區沒有可用號碼");
  }
  return rows;
}
function splitIntoTwoDigitNumbers(value) {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return [];
  if (digits.length % 2 !== 0) {
    throw new Error(`號碼區位數不是偶數：${value}`);
  }
  const numbers = [];
  for (let index = 0; index < digits.length; index += 2) {
    numbers.push(digits.slice(index, index + 2));
  }
  return numbers;
}
function parseCalculationRules(rulePart) {
  const rules = [];
  const normalized = String(rulePart).replace(/[×＊*]/g, "x");
  const pattern = /([一二兩三四五六七八九十0-9]+)\s*[xX]\s*([0-9]+(?:\.[0-9]+)?)/g;
  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    const picks = parsePickValues(match[1]);
    const multiplier = Number(match[2]);
    if (picks.length === 0 || Number.isNaN(multiplier)) {
      continue;
    }
    rules.push({ picks, multiplier });
  }
  if (rules.length === 0) {
    throw new Error("規則區沒有可用倍率");
  }
  return rules;
}
function parsePickValues(value) {
  const pickText = String(value).trim();
  const picks = [];
  if (/^\d+$/.test(pickText)) {
    for (const digit of pickText) {
      picks.push(Number(digit));
    }
    return picks;
  }
  for (const char of pickText) {
    const pick = chineseNumberToInteger(char);
    if (pick) picks.push(pick);
  }
  return picks;
}
function chineseNumberToInteger(value) {
  const numbers = {
    一: 1,
    二: 2,
    兩: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };
  return numbers[value] || null;
}
function calculateRowCombinationCount(rows, pick) {
  if (pick <= 0 || pick > rows.length) return 0;
  let total = 0;
  function visit(startIndex, pickedCount, product) {
    if (pickedCount === pick) {
      total += product;
      return;
    }
    for (let index = startIndex; index < rows.length; index += 1) {
      visit(index + 1, pickedCount + 1, product * rows[index].length);
    }
  }
  visit(0, 0, 1);
  return total;
}

// src/db.js
async function ensureDatabaseSchema(db) {
  await db.prepare(
    `
      CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
      `
  ).run();
  await ensureColumn(db, "friends", "deleted_at", "TEXT");
  await db.prepare(
    `
      CREATE TABLE IF NOT EXISTS user_sessions (
        line_user_id TEXT PRIMARY KEY,
        current_friend_id INTEGER,
        pending_action TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (current_friend_id) REFERENCES friends(id)
      )
      `
  ).run();
  await ensureColumn(db, "user_sessions", "pending_action", "TEXT");
  await db.prepare(
    `
      CREATE TABLE IF NOT EXISTS raw_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        friend_id INTEGER,
        line_user_id TEXT NOT NULL,
        message_type TEXT NOT NULL,
        raw_text TEXT,
        image_message_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (friend_id) REFERENCES friends(id)
      )
      `
  ).run();
  await db.prepare(
    `
      CREATE TABLE IF NOT EXISTS parsed_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_message_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        line_user_id TEXT NOT NULL,
        source_line_text TEXT NOT NULL,
        number_part TEXT,
        rule_part TEXT,
        rows_json TEXT,
        calculations_json TEXT,
        total_amount REAL NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (raw_message_id) REFERENCES raw_messages(id),
        FOREIGN KEY (friend_id) REFERENCES friends(id)
      )
      `
  ).run();
  await db.prepare(
    `
      CREATE TABLE IF NOT EXISTS friend_costs (
        friend_id INTEGER NOT NULL,
        game_type TEXT NOT NULL,
        star2_cost REAL NOT NULL DEFAULT 0,
        star3_cost REAL NOT NULL DEFAULT 0,
        star4_cost REAL NOT NULL DEFAULT 0,
        car_cost REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (friend_id, game_type),
        FOREIGN KEY (friend_id) REFERENCES friends(id)
      )
      `
  ).run();
  await db.prepare(
    `
      CREATE TABLE IF NOT EXISTS ai_parse_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_message_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        line_user_id TEXT NOT NULL,
        input_type TEXT NOT NULL,
        ai_output_json TEXT,
        normalized_text TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (raw_message_id) REFERENCES raw_messages(id),
        FOREIGN KEY (friend_id) REFERENCES friends(id)
      )
      `
  ).run();
}
async function ensureColumn(db, tableName, columnName, columnDefinition) {
  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  const columns = result.results || [];
  const hasColumn = columns.some((column) => column.name === columnName);
  if (!hasColumn) {
    await db.prepare(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`
    ).run();
  }
}
async function getFriends(db) {
  const result = await db.prepare(
    `
      SELECT id, name
      FROM friends
      WHERE deleted_at IS NULL
      ORDER BY id ASC
      `
  ).all();
  return result.results || [];
}
async function getFriendByName(db, name) {
  return await db.prepare(
    `
      SELECT id, name
      FROM friends
      WHERE name = ?
        AND deleted_at IS NULL
      `
  ).bind(name).first();
}
async function getFriendById(db, id) {
  return await db.prepare(
    `
      SELECT id, name
      FROM friends
      WHERE id = ?
        AND deleted_at IS NULL
      `
  ).bind(id).first();
}
async function createFriend(db, name) {
  const deletedFriend = await getDeletedFriendByName(db, name);
  if (deletedFriend) {
    await db.prepare(
      `
        UPDATE friends
        SET deleted_at = NULL
        WHERE id = ?
        `
    ).bind(deletedFriend.id).run();
    return await getFriendByName(db, name);
  }
  await db.prepare("INSERT OR IGNORE INTO friends (name) VALUES (?)").bind(name).run();
  return await getFriendByName(db, name);
}
async function getDeletedFriendByName(db, name) {
  return await db.prepare(
    `
      SELECT id, name
      FROM friends
      WHERE name = ?
        AND deleted_at IS NOT NULL
      `
  ).bind(name).first();
}
async function deleteFriend(db, friendId) {
  await db.prepare(
    `
      UPDATE user_sessions
      SET current_friend_id = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE current_friend_id = ?
      `
  ).bind(friendId).run();
  await db.prepare(
    `
      UPDATE friends
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND deleted_at IS NULL
      `
  ).bind(friendId).run();
}
async function getFriendCosts(db, friendId) {
  const result = await db.prepare(
    `
      SELECT game_type, star2_cost, star3_cost, star4_cost, car_cost, updated_at
      FROM friend_costs
      WHERE friend_id = ?
      ORDER BY
        CASE game_type
          WHEN '539' THEN 1
          WHEN '大樂透' THEN 2
          WHEN '港號' THEN 3
          ELSE 4
        END
      `
  ).bind(friendId).all();
  return result.results || [];
}
async function getOrCreateFriendCosts(db, friendId) {
  let costs = await getFriendCosts(db, friendId);
  if (costs.length > 0) {
    return { costs, usedDefaultCosts: false };
  }
  await saveFriendCosts(db, friendId, DEFAULT_COST_ROWS);
  costs = await getFriendCosts(db, friendId);
  return { costs, usedDefaultCosts: true };
}
async function saveFriendCosts(db, friendId, costRows) {
  for (const row of costRows) {
    await db.prepare(
      `
        INSERT INTO friend_costs (
          friend_id,
          game_type,
          star2_cost,
          star3_cost,
          star4_cost,
          car_cost,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(friend_id, game_type)
        DO UPDATE SET
          star2_cost = excluded.star2_cost,
          star3_cost = excluded.star3_cost,
          star4_cost = excluded.star4_cost,
          car_cost = excluded.car_cost,
          updated_at = CURRENT_TIMESTAMP
        `
    ).bind(
      friendId,
      row.gameType,
      row.star2Cost,
      row.star3Cost,
      row.star4Cost,
      row.carCost
    ).run();
  }
}
async function setCurrentFriend(db, lineUserId, friendId) {
  await db.prepare(
    `
      INSERT INTO user_sessions (
        line_user_id,
        current_friend_id,
        pending_action,
        updated_at
      )
      VALUES (?, ?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(line_user_id)
      DO UPDATE SET
        current_friend_id = excluded.current_friend_id,
        pending_action = NULL,
        updated_at = CURRENT_TIMESTAMP
      `
  ).bind(lineUserId, friendId).run();
}
async function setPendingAction(db, lineUserId, pendingAction) {
  await db.prepare(
    `
      INSERT INTO user_sessions (line_user_id, pending_action, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(line_user_id)
      DO UPDATE SET
        pending_action = excluded.pending_action,
        updated_at = CURRENT_TIMESTAMP
      `
  ).bind(lineUserId, pendingAction).run();
}
async function clearPendingAction(db, lineUserId) {
  await db.prepare(
    `
      UPDATE user_sessions
      SET pending_action = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE line_user_id = ?
      `
  ).bind(lineUserId).run();
}
async function getCurrentSession(db, lineUserId) {
  return await db.prepare(
    `
      SELECT
        friends.id AS friend_id,
        user_sessions.pending_action AS pending_action,
        friends.name AS friend_name
      FROM user_sessions
      LEFT JOIN friends
        ON friends.id = user_sessions.current_friend_id
       AND friends.deleted_at IS NULL
      WHERE user_sessions.line_user_id = ?
      `
  ).bind(lineUserId).first();
}
async function saveRawMessage(db, message) {
  const result = await db.prepare(
    `
      INSERT INTO raw_messages (
        friend_id,
        line_user_id,
        message_type,
        raw_text,
        image_message_id
      )
      VALUES (?, ?, ?, ?, ?)
      `
  ).bind(
    message.friendId,
    message.lineUserId,
    message.messageType,
    message.rawText,
    message.imageMessageId
  ).run();
  return result.meta?.last_row_id ?? null;
}
async function saveParsedEntriesForText(db, message) {
  if (!message.rawMessageId) return;
  const entries = parseTextToCalculationEntries(message.rawText);
  for (const entry of entries) {
    await db.prepare(
      `
        INSERT INTO parsed_entries (
          raw_message_id,
          friend_id,
          line_user_id,
          source_line_text,
          number_part,
          rule_part,
          rows_json,
          calculations_json,
          total_amount,
          error_message
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
    ).bind(
      message.rawMessageId,
      message.friendId,
      message.lineUserId,
      entry.sourceLineText,
      entry.numberPart,
      entry.rulePart,
      JSON.stringify(entry.rows),
      JSON.stringify(entry.calculations),
      entry.totalAmount,
      entry.errorMessage
    ).run();
  }
  return entries;
}
async function saveAIParseResult(db, result) {
  await db.prepare(
    `
      INSERT INTO ai_parse_results (
        raw_message_id,
        friend_id,
        line_user_id,
        input_type,
        ai_output_json,
        normalized_text,
        status,
        error_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
  ).bind(
    result.rawMessageId,
    result.friendId,
    result.lineUserId,
    result.inputType,
    result.aiOutputJson,
    result.normalizedText,
    result.status,
    result.errorMessage
  ).run();
}
async function getParsedEntriesByFriendAndDate(db, friendId, dateText) {
  const result = await db.prepare(
    `
      SELECT
        id,
        source_line_text,
        rows_json,
        calculations_json,
        total_amount,
        error_message,
        created_at
      FROM parsed_entries
      WHERE friend_id = ?
        AND date(created_at, '+8 hours') = ?
      ORDER BY created_at ASC, id ASC
      LIMIT 1000
      `
  ).bind(friendId, dateText).all();
  return (result.results || []).map(normalizeParsedEntryFromDb);
}
async function getImageMessageCountByFriendAndDate(db, friendId, dateText) {
  const row = await db.prepare(
    `
      SELECT COUNT(*) AS count
      FROM raw_messages
      LEFT JOIN parsed_entries
        ON parsed_entries.raw_message_id = raw_messages.id
      WHERE raw_messages.friend_id = ?
        AND raw_messages.message_type = 'image'
        AND date(raw_messages.created_at, '+8 hours') = ?
        AND parsed_entries.id IS NULL
      `
  ).bind(friendId, dateText).first();
  return row?.count || 0;
}
async function getFriendsWithOrdersByDate(db, dateText) {
  const result = await db.prepare(
    `
      SELECT DISTINCT friends.id, friends.name
      FROM friends
      LEFT JOIN raw_messages
        ON raw_messages.friend_id = friends.id
       AND date(raw_messages.created_at, '+8 hours') = ?
      LEFT JOIN parsed_entries
        ON parsed_entries.friend_id = friends.id
       AND date(parsed_entries.created_at, '+8 hours') = ?
      WHERE friends.deleted_at IS NULL
        AND (raw_messages.id IS NOT NULL OR parsed_entries.id IS NOT NULL)
      ORDER BY friends.id ASC
      `
  ).bind(dateText, dateText).all();
  return result.results || [];
}
function normalizeParsedEntryFromDb(row) {
  return {
    sourceLineText: row.source_line_text,
    rows: parseJsonOrDefault(row.rows_json, []),
    calculations: parseJsonOrDefault(row.calculations_json, []),
    totalAmount: row.total_amount || 0,
    errorMessage: row.error_message
  };
}
function parseJsonOrDefault(value, defaultValue) {
  try {
    return value ? JSON.parse(value) : defaultValue;
  } catch (error) {
    return defaultValue;
  }
}

// src/lineReplies.js
async function replyMessage(replyToken, text, channelAccessToken) {
  await replyLineMessages(
    replyToken,
    [
      {
        type: "text",
        text
      }
    ],
    channelAccessToken
  );
}
async function replyButtonMenu(replyToken, channelAccessToken, { altText, title, description, buttons }) {
  await replyLineMessages(
    replyToken,
    [
      {
        type: "flex",
        altText,
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
              {
                type: "text",
                text: title,
                weight: "bold",
                size: "lg"
              },
              {
                type: "text",
                text: description,
                size: "sm",
                color: "#666666",
                wrap: true
              },
              {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: buttons
              }
            ]
          }
        }
      }
    ],
    channelAccessToken
  );
}
async function replyLineMessages(replyToken, messages, channelAccessToken) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify({
      replyToken,
      messages
    })
  });
}
async function replyFriendPicker(replyToken, friends, channelAccessToken) {
  if (friends.length === 0) {
    await replyMessage(
      replyToken,
      "目前沒有朋友名單。請先新增朋友。",
      channelAccessToken
    );
    return;
  }
  const buttons = friends.slice(0, 12).map((friend) => ({
    type: "button",
    style: "primary",
    color: "#06C755",
    action: {
      type: "message",
      label: friend.name,
      text: `#${friend.name}`
    }
  }));
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: "flex",
          altText: "請選擇朋友",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              spacing: "md",
              contents: [
                {
                  type: "text",
                  text: "請選擇朋友",
                  weight: "bold",
                  size: "lg"
                },
                {
                  type: "text",
                  text: "選好後，接下來傳入的資料會記錄到目前來源。",
                  size: "sm",
                  color: "#666666",
                  wrap: true
                },
                {
                  type: "box",
                  layout: "vertical",
                  spacing: "sm",
                  contents: buttons
                }
              ]
            }
          }
        }
      ]
    })
  });
}
async function replyFriendManagementMenu(replyToken, channelAccessToken) {
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: "朋友管理",
    title: "朋友管理",
    description: "新增朋友或刪除朋友。刪除會先要求二次確認。",
    buttons: [
      {
        type: "button",
        style: "primary",
        color: "#06C755",
        action: {
          type: "message",
          label: "新增朋友",
          text: COMMANDS.ADD_FRIEND
        }
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: "查看朋友列表",
          text: COMMANDS.FRIEND_LIST
        }
      },
      {
        type: "button",
        style: "primary",
        color: "#D93025",
        action: {
          type: "message",
          label: "刪除朋友",
          text: COMMANDS.DELETE_FRIEND
        }
      }
    ]
  });
}
async function replyDeleteFriendPicker(replyToken, friends, channelAccessToken) {
  if (friends.length === 0) {
    await replyMessage(
      replyToken,
      "目前沒有朋友名單可刪除。",
      channelAccessToken
    );
    return;
  }
  const buttons = friends.slice(0, 12).map((friend) => ({
    type: "button",
    style: "primary",
    color: "#D93025",
    action: {
      type: "message",
      label: friend.name,
      text: `!刪除朋友:${friend.name}`
    }
  }));
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: "flex",
          altText: "請選擇要刪除的朋友",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              spacing: "md",
              contents: [
                {
                  type: "text",
                  text: "請選擇要刪除的朋友",
                  weight: "bold",
                  size: "lg"
                },
                {
                  type: "text",
                  text: "刪除後會從名單隱藏，已記錄資料不會刪除。",
                  size: "sm",
                  color: "#666666",
                  wrap: true
                },
                {
                  type: "box",
                  layout: "vertical",
                  spacing: "sm",
                  contents: buttons
                }
              ]
            }
          }
        }
      ]
    })
  });
}
async function replyDeleteFriendConfirmation(replyToken, friend, channelAccessToken) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: "flex",
          altText: `確認刪除朋友：${friend.name}`,
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              spacing: "md",
              contents: [
                {
                  type: "text",
                  text: "確認刪除朋友",
                  weight: "bold",
                  size: "lg"
                },
                {
                  type: "text",
                  text: `確定要刪除 ${friend.name} 嗎？`,
                  size: "md",
                  wrap: true
                },
                {
                  type: "text",
                  text: "刪除後會從名單隱藏，已記錄注單與報表資料不會刪除。",
                  size: "sm",
                  color: "#666666",
                  wrap: true
                }
              ]
            },
            footer: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  color: "#D93025",
                  action: {
                    type: "message",
                    label: "確認刪除",
                    text: `${INTERNAL_COMMANDS.CONFIRM_DELETE_FRIEND_PREFIX}${friend.name}`
                  }
                },
                {
                  type: "button",
                  style: "secondary",
                  action: {
                    type: "message",
                    label: "取消",
                    text: INTERNAL_COMMANDS.CANCEL_DELETE_FRIEND
                  }
                }
              ]
            }
          }
        }
      ]
    })
  });
}
async function replyPastOrdersMenu(replyToken, channelAccessToken) {
  const yesterday = addDaysToTaipeiDate(-1);
  const dayBeforeYesterday = addDaysToTaipeiDate(-2);
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: "過往注單",
    title: "過往注單",
    description: "請先選擇日期，再選擇要查看的朋友。",
    buttons: [
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `昨天 ${yesterday}`,
          text: `${INTERNAL_COMMANDS.PAST_ORDER_DATE_PREFIX}${yesterday}`
        }
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `前天 ${dayBeforeYesterday}`,
          text: `${INTERNAL_COMMANDS.PAST_ORDER_DATE_PREFIX}${dayBeforeYesterday}`
        }
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "特定日期",
          text: `${INTERNAL_COMMANDS.PAST_ORDER_DATE_PREFIX}指定日期`
        }
      }
    ]
  });
}
async function replyOrderReportFriendPicker(replyToken, friends, dateText, channelAccessToken) {
  if (friends.length === 0) {
    await replyMessage(
      replyToken,
      `${dateText} 沒有任何朋友的注單資料。`,
      channelAccessToken
    );
    return;
  }
  const buttons = friends.slice(0, 12).map((friend) => ({
    type: "button",
    style: "primary",
    color: "#1A73E8",
    action: {
      type: "message",
      label: friend.name,
      text: `${INTERNAL_COMMANDS.ORDER_REPORT_PREFIX}${dateText}|${friend.name}`
    }
  }));
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: `請選擇 ${dateText} 注單朋友`,
    title: `${dateText} 注單`,
    description: "請選擇要查看注單與支數統計的朋友。",
    buttons
  });
}
async function replyCostManagementFriendPicker(replyToken, friends, channelAccessToken) {
  if (friends.length === 0) {
    await replyMessage(
      replyToken,
      "目前沒有朋友名單。請先新增朋友。",
      channelAccessToken
    );
    return;
  }
  const buttons = friends.slice(0, 12).map((friend) => ({
    type: "button",
    style: "primary",
    color: "#7B61FF",
    action: {
      type: "message",
      label: friend.name,
      text: `${INTERNAL_COMMANDS.COST_MANAGEMENT_PREFIX}${friend.name}`
    }
  }));
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: "請選擇成本管理朋友",
    title: "成本管理",
    description: "請先選擇朋友，再查看或編輯成本設定。",
    buttons
  });
}
async function replyCostActionMenu(replyToken, friend, channelAccessToken) {
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: `成本管理：${friend.name}`,
    title: `${friend.name} 成本管理`,
    description: "可查看或編輯 539、大樂透、港號與車的成本。",
    buttons: [
      {
        type: "button",
        style: "primary",
        color: "#7B61FF",
        action: {
          type: "message",
          label: "查看成本",
          text: `${INTERNAL_COMMANDS.VIEW_COST_PREFIX}${friend.name}`
        }
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "編輯成本",
          text: `${INTERNAL_COMMANDS.EDIT_COST_PREFIX}${friend.name}`
        }
      }
    ]
  });
}
async function replyCostEditModeMenu(replyToken, friend, channelAccessToken) {
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: `編輯成本：${friend.name}`,
    title: `${friend.name} 編輯成本`,
    description: "可以直接套用預設成本，或改用手動輸入逐項設定。",
    buttons: [
      {
        type: "button",
        style: "primary",
        color: "#06C755",
        action: {
          type: "message",
          label: "套用預設成本",
          text: `${INTERNAL_COMMANDS.APPLY_DEFAULT_COST_PREFIX}${friend.name}`
        }
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "手動輸入",
          text: `${INTERNAL_COMMANDS.MANUAL_EDIT_COST_PREFIX}${friend.name}`
        }
      }
    ]
  });
}
async function replyCostInputPrompt(replyToken, friendName, gameType, channelAccessToken, noticeText = null) {
  const contents = [];
  const defaultCostText = formatCostValues(DEFAULT_COST_VALUES_BY_GAME[gameType]);
  if (noticeText) {
    contents.push({
      type: "text",
      text: noticeText,
      size: "sm",
      color: noticeText.startsWith("成本格式不正確") ? "#D93025" : "#06C755",
      wrap: true
    });
  }
  contents.push(
    {
      type: "text",
      text: `請輸入 ${friendName} 的成本`,
      size: "sm",
      color: "#666666",
      wrap: true
    },
    {
      type: "text",
      text: `「${gameType}」`,
      weight: "bold",
      size: "xl",
      wrap: true
    },
    {
      type: "text",
      text: `格式：${defaultCostText}`,
      size: "md",
      color: "#111111",
      wrap: true
    },
    {
      type: "text",
      text: "四個數字請用逗號串接，依序代表二星、三星、四星、車組成本。",
      size: "sm",
      color: "#666666",
      wrap: true
    }
  );
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: "flex",
          altText: `請輸入「${gameType}」成本`,
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              spacing: "md",
              contents
            }
          }
        }
      ]
    })
  });
}

// src/main.js
var main_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response("LINE helper is running");
    }
    if (url.pathname === "/line/webhook" && request.method === "POST") {
      const body = await request.json();
      await ensureDatabaseSchema(env.DB);
      for (const event of body.events || []) {
        const userId = event.source?.userId;
        if (!isAllowedUser(userId, env.ALLOWED_USER_IDS)) {
          if (event.replyToken) {
            await replyMessage(
              event.replyToken,
              "尚未授權使用這個服務。",
              env.LINE_CHANNEL_ACCESS_TOKEN
            );
          }
          continue;
        }
        if (event.type !== "message") {
          continue;
        }
        if (event.message.type === "text") {
          await handleTextMessage(event, env, userId);
          continue;
        }
        if (event.message.type === "image") {
          await handleImageMessage(event, env, userId);
          continue;
        }
        await replyMessage(
          event.replyToken,
          `收到 ${event.message.type} 類型訊息，目前尚未支援。`,
          env.LINE_CHANNEL_ACCESS_TOKEN
        );
      }
      return new Response("OK");
    }
    return new Response("Not found", { status: 404 });
  }
};
async function handleTextMessage(event, env, userId) {
  const text = event.message.text.trim();
  if (text === COMMANDS.ADD_FRIEND) {
    await handleAddFriendCommand(event, env, userId);
    return;
  }
  const session = await getCurrentSession(env.DB, userId);
  if (await handleInternalTextCommand(event, env, userId, text, session)) {
    return;
  }
  if (await handleRichMenuCommand(event, env, userId, text, session)) {
    return;
  }
  if (session?.pending_action === PENDING_ACTIONS.ADD_FRIEND) {
    await handlePendingAddFriend(event, env, userId, text);
    return;
  }
  if (session?.pending_action === PENDING_ACTIONS.PAST_ORDER_DATE) {
    await handlePendingPastOrderDate(event, env, userId, text);
    return;
  }
  if (session?.pending_action?.startsWith(PENDING_ACTIONS.EDIT_COST_PREFIX)) {
    await handlePendingEditCost(event, env, userId, text, session);
    return;
  }
  await handleSaveTextMessage(event, env, userId, text, session);
}
async function handleInternalTextCommand(event, env, userId, text, session) {
  if (text.startsWith(INTERNAL_COMMANDS.CONFIRM_DELETE_FRIEND_PREFIX)) {
    const friendName = text.slice(INTERNAL_COMMANDS.CONFIRM_DELETE_FRIEND_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleConfirmDeleteFriend(event, env, friendName);
    return true;
  }
  if (text === INTERNAL_COMMANDS.CANCEL_DELETE_FRIEND) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await replyMessage(
      event.replyToken,
      "已取消刪除朋友。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.DELETE_FRIEND_PREFIX)) {
    const friendName = text.slice(INTERNAL_COMMANDS.DELETE_FRIEND_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleDeleteFriend(event, env, friendName);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.ORDER_REPORT_PREFIX)) {
    const payload = text.slice(INTERNAL_COMMANDS.ORDER_REPORT_PREFIX.length);
    const { dateText, friendName } = parseDateFriendPayload(payload);
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleOrderReportForFriendName(event, env, dateText, friendName);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.PAST_ORDER_DATE_PREFIX)) {
    const dateText = text.slice(INTERNAL_COMMANDS.PAST_ORDER_DATE_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handlePastOrderDateSelected(event, env, dateText);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.COST_MANAGEMENT_PREFIX)) {
    const friendName = text.slice(INTERNAL_COMMANDS.COST_MANAGEMENT_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleCostManagementForFriendName(event, env, friendName);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.VIEW_COST_PREFIX)) {
    const friendName = text.slice(INTERNAL_COMMANDS.VIEW_COST_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleViewCost(event, env, friendName);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.EDIT_COST_PREFIX)) {
    const friendName = text.slice(INTERNAL_COMMANDS.EDIT_COST_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleEditCost(event, env, friendName);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.APPLY_DEFAULT_COST_PREFIX)) {
    const friendName = text.slice(INTERNAL_COMMANDS.APPLY_DEFAULT_COST_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleApplyDefaultCost(event, env, friendName);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.MANUAL_EDIT_COST_PREFIX)) {
    const friendName = text.slice(INTERNAL_COMMANDS.MANUAL_EDIT_COST_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleManualEditCost(event, env, friendName);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.SELECT_FRIEND_PREFIX)) {
    const friendName = text.slice(INTERNAL_COMMANDS.SELECT_FRIEND_PREFIX.length).trim();
    await handleSelectFriendByName(event, env, userId, friendName);
    return true;
  }
  return false;
}
async function handleRichMenuCommand(event, env, userId, text, session) {
  if (text === COMMANDS.SELECT_FRIEND_FOR_BET) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleSelectFriendCommand(event, env);
    return true;
  }
  if (text === COMMANDS.TODAY_ORDERS) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleOrderReportDateCommand(event, env, getTaipeiDateString());
    return true;
  }
  if (text === COMMANDS.PAST_ORDERS) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handlePastOrdersCommand(event, env);
    return true;
  }
  if (text === COMMANDS.FRIEND_MANAGEMENT) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleFriendManagementCommand(event, env);
    return true;
  }
  if (text === COMMANDS.DELETE_FRIEND) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleDeleteFriendCommand(event, env);
    return true;
  }
  if (text === COMMANDS.FRIEND_LIST) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleFriendListCommand(event, env);
    return true;
  }
  if (text === COMMANDS.COST_MANAGEMENT) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleCostManagementCommand(event, env);
    return true;
  }
  if (text === COMMANDS.HELP) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleHelpCommand(event, env);
    return true;
  }
  return false;
}
async function handleAddFriendCommand(event, env, userId) {
  await setPendingAction(env.DB, userId, PENDING_ACTIONS.ADD_FRIEND);
  await replyMessage(
    event.replyToken,
    "請輸入朋友名稱。可連續輸入多位朋友，不會影響目前來源。",
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleSelectFriendCommand(event, env) {
  const friends = await getFriends(env.DB);
  await replyFriendPicker(
    event.replyToken,
    friends,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleSelectFriendByName(event, env, userId, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。請先新增朋友。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await setCurrentFriend(env.DB, userId, friend.id);
  await replyMessage(
    event.replyToken,
    `目前下單朋友已設定為：${friend.name}`,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleFriendManagementCommand(event, env) {
  await replyFriendManagementMenu(
    event.replyToken,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleDeleteFriendCommand(event, env) {
  const friends = await getFriends(env.DB);
  await replyDeleteFriendPicker(
    event.replyToken,
    friends,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleFriendListCommand(event, env) {
  const friends = await getFriends(env.DB);
  if (friends.length === 0) {
    await replyMessage(
      event.replyToken,
      "目前沒有朋友名單。請先新增朋友。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const lines = ["朋友列表", ""];
  for (const [index, friend] of friends.entries()) {
    lines.push(`${index + 1}. ${friend.name}`);
  }
  await replyMessage(
    event.replyToken,
    lines.join("\n"),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleOrderReportDateCommand(event, env, dateText) {
  const friends = await getFriendsWithOrdersByDate(env.DB, dateText);
  await replyOrderReportFriendPicker(
    event.replyToken,
    friends,
    dateText,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handlePastOrdersCommand(event, env) {
  await replyPastOrdersMenu(event.replyToken, env.LINE_CHANNEL_ACCESS_TOKEN);
}
async function handlePastOrderDateSelected(event, env, dateText) {
  if (dateText === "指定日期") {
    await setPendingAction(env.DB, event.source.userId, PENDING_ACTIONS.PAST_ORDER_DATE);
    await replyMessage(
      event.replyToken,
      "請輸入日期，格式 yyyy-MM-dd，例如 2026-05-16。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await handleOrderReportDateCommand(event, env, dateText);
}
async function handlePendingPastOrderDate(event, env, userId, text) {
  const dateText = text.trim();
  if (!isValidDateText(dateText)) {
    await replyMessage(
      event.replyToken,
      "日期格式不正確，請輸入 yyyy-MM-dd，例如 2026-05-16。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await clearPendingAction(env.DB, userId);
  await handleOrderReportDateCommand(event, env, dateText);
}
async function handleOrderReportForFriendName(event, env, dateText, friendName) {
  if (!isValidDateText(dateText)) {
    await replyMessage(
      event.replyToken,
      "日期格式不正確。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const entries = await getParsedEntriesByFriendAndDate(env.DB, friend.id, dateText);
  const imageCount = await getImageMessageCountByFriendAndDate(
    env.DB,
    friend.id,
    dateText
  );
  if (entries.length === 0 && imageCount === 0) {
    await replyMessage(
      event.replyToken,
      `${friend.name} ${dateText} 沒有注單資料。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const report = buildCalculationReport(friend.name, entries, imageCount, dateText);
  await replyMessage(event.replyToken, report, env.LINE_CHANNEL_ACCESS_TOKEN);
}
async function handleCostManagementCommand(event, env) {
  const friends = await getFriends(env.DB);
  await replyCostManagementFriendPicker(
    event.replyToken,
    friends,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleCostManagementForFriendName(event, env, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await replyCostActionMenu(
    event.replyToken,
    friend,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleViewCost(event, env, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const { costs, usedDefaultCosts } = await getOrCreateFriendCosts(
    env.DB,
    friend.id
  );
  const message = usedDefaultCosts ? [
    `${friend.name} 尚未設定成本，已自動套用預設成本。`,
    "",
    buildCostReport(friend.name, costs)
  ].join("\n") : buildCostReport(friend.name, costs);
  await replyMessage(
    event.replyToken,
    message,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleEditCost(event, env, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await replyCostEditModeMenu(
    event.replyToken,
    friend,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleApplyDefaultCost(event, env, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await saveFriendCosts(env.DB, friend.id, DEFAULT_COST_ROWS);
  const costs = await getFriendCosts(env.DB, friend.id);
  await replyMessage(
    event.replyToken,
    [`已套用 ${friend.name} 的預設成本。`, "", buildCostReport(friend.name, costs)].join(
      "\n"
    ),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleManualEditCost(event, env, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await setPendingAction(
    env.DB,
    event.source.userId,
    buildEditCostPendingAction(friend.id, 0, [])
  );
  await replyCostInputPrompt(
    event.replyToken,
    friend.name,
    COST_GAME_TYPES[0],
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handlePendingEditCost(event, env, userId, text, session) {
  const state = parseEditCostPendingAction(session.pending_action);
  const friendId = state.friendId;
  const friend = await getFriendById(env.DB, friendId);
  if (!friend) {
    await clearPendingAction(env.DB, userId);
    await replyMessage(
      event.replyToken,
      "找不到要編輯成本的朋友，已取消編輯模式。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  let costRow;
  const gameType = COST_GAME_TYPES[state.gameIndex];
  try {
    costRow = parseCostCsvLine(gameType, text);
  } catch (error) {
    await replyCostInputPrompt(
      event.replyToken,
      friend.name,
      gameType,
      env.LINE_CHANNEL_ACCESS_TOKEN,
      `成本格式不正確：${error.message}`
    );
    return;
  }
  const costRows = [...state.costRows, costRow];
  const nextGameIndex = state.gameIndex + 1;
  if (nextGameIndex < COST_GAME_TYPES.length) {
    await setPendingAction(
      env.DB,
      userId,
      buildEditCostPendingAction(friend.id, nextGameIndex, costRows)
    );
    await replyCostInputPrompt(
      event.replyToken,
      friend.name,
      COST_GAME_TYPES[nextGameIndex],
      env.LINE_CHANNEL_ACCESS_TOKEN,
      `已暫存「${gameType}」成本。`
    );
    return;
  }
  await saveFriendCosts(env.DB, friend.id, costRows);
  await clearPendingAction(env.DB, userId);
  const costs = await getFriendCosts(env.DB, friend.id);
  await replyMessage(
    event.replyToken,
    [`已更新 ${friend.name} 的成本設定。`, "", buildCostReport(friend.name, costs)].join(
      "\n"
    ),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleHelpCommand(event, env) {
  await replyMessage(
    event.replyToken,
    [
      "使用方式：",
      "1. 點「選朋友下單」",
      "2. 選擇要記錄注單的朋友",
      "3. 傳入這位朋友的文字或圖片注單",
      "4. 點「今日注單」查看今天的注單與支數統計",
      "",
      "過往注單：",
      "可選昨天、前天或輸入特定日期，再選朋友查看。",
      "",
      "朋友管理：",
      "可新增朋友或刪除朋友。",
      "新增朋友只會加入名單，不會改變目前來源，也不會建立朋友之間的關聯。",
      "刪除朋友會先要求二次確認，並只做軟刪。"
    ].join("\n"),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleSaveTextMessage(event, env, userId, text, session) {
  if (!session?.friend_id) {
    await replyMessage(
      event.replyToken,
      "請先點「選朋友」設定目前來源，再傳入資料。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const rawMessageId = await saveRawMessage(env.DB, {
    friendId: session.friend_id,
    lineUserId: userId,
    messageType: "text",
    rawText: text,
    imageMessageId: null
  });
  const parseResult = await parseAndSaveOrderText(env, {
    rawMessageId,
    friendId: session.friend_id,
    lineUserId: userId,
    inputType: "text",
    rawText: text
  });
  await replyMessage(
    event.replyToken,
    buildOrderReceivedMessage(session.friend_name, parseResult),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function clearPendingActionIfNeeded(db, userId, session) {
  if (session?.pending_action) {
    await clearPendingAction(db, userId);
  }
}
async function handlePendingAddFriend(event, env, userId, text) {
  const friendName = text.trim();
  if (!friendName) {
    await replyMessage(
      event.replyToken,
      "朋友名稱不能是空白，請重新輸入朋友名稱。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const existingFriend = await getFriendByName(env.DB, friendName);
  if (existingFriend) {
    await replyMessage(
      event.replyToken,
      [
        `朋友已存在：${existingFriend.name}`,
        "可繼續輸入下一位朋友名稱，不會影響目前來源。"
      ].join("\n"),
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const friend = await createFriend(env.DB, friendName);
  await replyMessage(
    event.replyToken,
    [
      `已新增朋友：${friend.name}`,
      "可繼續輸入下一位朋友名稱，不會影響目前來源。"
    ].join("\n"),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleDeleteFriend(event, env, friendName) {
  if (!friendName) {
    await replyMessage(
      event.replyToken,
      "請先選擇要刪除的朋友。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await replyDeleteFriendConfirmation(
    event.replyToken,
    friend,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleConfirmDeleteFriend(event, env, friendName) {
  if (!friendName) {
    await replyMessage(
      event.replyToken,
      "請先選擇要刪除的朋友。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await deleteFriend(env.DB, friend.id);
  await replyMessage(
    event.replyToken,
    `已刪除朋友：${friend.name}`,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleImageMessage(event, env, userId) {
  const session = await getCurrentSession(env.DB, userId);
  if (session?.pending_action === PENDING_ACTIONS.ADD_FRIEND) {
    await replyMessage(
      event.replyToken,
      "請輸入文字作為朋友名稱，不要傳圖片。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await handleSaveImageMessage(event, env, userId, session);
}
async function handleSaveImageMessage(event, env, userId, session) {
  if (!session?.friend_id) {
    await replyMessage(
      event.replyToken,
      "請先點「選朋友」設定目前來源，再傳入圖片。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const rawMessageId = await saveRawMessage(env.DB, {
    friendId: session.friend_id,
    lineUserId: userId,
    messageType: "image",
    rawText: null,
    imageMessageId: event.message.id
  });
  if (!hasOpenAIConfig(env)) {
    await replyMessage(
      event.replyToken,
      [
        `已收到 ${session.friend_name} 的圖片注單。`,
        "目前尚未設定 OPENAI_API_KEY，圖片已先保存，但尚未解析。"
      ].join("\n"),
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const parseResult = await parseAndSaveOrderImage(env, {
    rawMessageId,
    friendId: session.friend_id,
    lineUserId: userId,
    messageId: event.message.id
  });
  await replyMessage(
    event.replyToken,
    buildOrderReceivedMessage(session.friend_name, parseResult),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function parseAndSaveOrderText(env, message) {
  if (!hasOpenAIConfig(env)) {
    const entries = await saveParsedEntriesForText(env.DB, message);
    return {
      status: "fallback",
      parsedCount: countSuccessfulEntries(entries),
      errorCount: countFailedEntries(entries),
      warnings: ["尚未設定 OPENAI_API_KEY，已用原始文字直接解析。"]
    };
  }
  try {
    const aiResult = await parseOrderTextWithAI(env, message.rawText);
    return await saveAIParseResultAndEntries(env, message, aiResult);
  } catch (error) {
    await saveAIParseResult(env.DB, {
      rawMessageId: message.rawMessageId,
      friendId: message.friendId,
      lineUserId: message.lineUserId,
      inputType: message.inputType,
      aiOutputJson: null,
      normalizedText: null,
      status: "error",
      errorMessage: error.message
    });
    const entries = await saveParsedEntriesForText(env.DB, message);
    return {
      status: "fallback",
      parsedCount: countSuccessfulEntries(entries),
      errorCount: countFailedEntries(entries),
      warnings: [`AI 解析失敗，已改用原始文字直接解析：${error.message}`]
    };
  }
}
async function parseAndSaveOrderImage(env, message) {
  try {
    const image = await downloadLineImage(env, message.messageId);
    const aiResult = await parseOrderImageWithAI(env, image);
    return await saveAIParseResultAndEntries(env, {
      ...message,
      inputType: "image"
    }, aiResult);
  } catch (error) {
    await saveAIParseResult(env.DB, {
      rawMessageId: message.rawMessageId,
      friendId: message.friendId,
      lineUserId: message.lineUserId,
      inputType: "image",
      aiOutputJson: null,
      normalizedText: null,
      status: "error",
      errorMessage: error.message
    });
    return {
      status: "error",
      parsedCount: 0,
      errorCount: 0,
      warnings: [`圖片已保存，但 AI 解析失敗：${error.message}`]
    };
  }
}
async function saveAIParseResultAndEntries(env, message, aiResult) {
  const normalizedText = buildNormalizedOrderText(aiResult);
  const status = normalizedText ? "success" : "empty";
  await saveAIParseResult(env.DB, {
    rawMessageId: message.rawMessageId,
    friendId: message.friendId,
    lineUserId: message.lineUserId,
    inputType: message.inputType,
    aiOutputJson: JSON.stringify(aiResult),
    normalizedText,
    status,
    errorMessage: null
  });
  if (!normalizedText) {
    return {
      status,
      parsedCount: 0,
      errorCount: 0,
      warnings: aiResult.warnings
    };
  }
  const entries = await saveParsedEntriesForText(env.DB, {
    rawMessageId: message.rawMessageId,
    friendId: message.friendId,
    lineUserId: message.lineUserId,
    rawText: normalizedText
  });
  return {
    status,
    parsedCount: countSuccessfulEntries(entries),
    errorCount: countFailedEntries(entries),
    warnings: aiResult.warnings
  };
}
function buildOrderReceivedMessage(friendName, parseResult) {
  const lines = [`已收到 ${friendName} 的下注內容。`];
  if (parseResult.parsedCount > 0) {
    lines.push(`成功解析 ${parseResult.parsedCount} 行。`);
  }
  if (parseResult.errorCount > 0) {
    lines.push(`有 ${parseResult.errorCount} 行格式仍需確認。`);
  }
  if (parseResult.parsedCount === 0 && parseResult.errorCount === 0) {
    lines.push("目前沒有可計算的注單行。");
  }
  if (parseResult.warnings?.length > 0) {
    lines.push("");
    lines.push("提醒：");
    lines.push(...parseResult.warnings.slice(0, 5));
  }
  return lines.join("\n");
}
function countSuccessfulEntries(entries = []) {
  return entries.filter((entry) => !entry.errorMessage).length;
}
function countFailedEntries(entries = []) {
  return entries.filter((entry) => entry.errorMessage).length;
}
export {
  main_default as default
};
