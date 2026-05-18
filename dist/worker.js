// src/constants.js
var COMMANDS = {
  SELECT_FRIEND_FOR_BET: "選朋友下單",
  ADD_FRIEND: "新增朋友",
  DELETE_FRIEND: "刪除朋友",
  FRIEND_LIST: "查看朋友列表",
  TODAY_ORDERS: "今日注單",
  PAST_ORDERS: "過往注單",
  EDIT_ORDER: "修改注單",
  FRIEND_MANAGEMENT: "朋友管理",
  COST_MANAGEMENT: "成本管理",
  FRIEND_COST_MANAGEMENT: "朋友成本與獎金",
  WINNING_NUMBER_MANAGEMENT: "開獎號碼",
  DAILY_TOTAL_REPORT: "每日總報表",
  HELP: "說明"
};
var INTERNAL_COMMANDS = {
  SELECT_FRIEND_PREFIX: "#",
  DELETE_FRIEND_PREFIX: "!刪除朋友:",
  CONFIRM_DELETE_FRIEND_PREFIX: "!確認刪除朋友:",
  CANCEL_DELETE_FRIEND: "!取消刪除朋友",
  ORDER_REPORT_PREFIX: "!注單報表:",
  PAST_ORDER_DATE_PREFIX: "!過往注單日期:",
  EDIT_ORDER_DATE_PREFIX: "!修改注單日期:",
  EDIT_ORDER_FRIEND_PREFIX: "!修改注單朋友:",
  EDIT_ORDER_MESSAGE_PREFIX: "!修改注單內容:",
  SELECT_GAME_PREFIX: "!選彩種:",
  COST_MANAGEMENT_PREFIX: "!成本管理:",
  VIEW_COST_PREFIX: "!查看成本:",
  EDIT_COST_PREFIX: "!編輯成本:",
  APPLY_DEFAULT_COST_PREFIX: "!套用預設成本:",
  MANUAL_EDIT_COST_PREFIX: "!手動編輯成本:",
  WINNING_NUMBER_DATE_PREFIX: "!開獎日期:",
  WINNING_NUMBER_GAME_PREFIX: "!開獎彩種:",
  DAILY_REPORT_DATE_PREFIX: "!每日報表日期:"
};
var PENDING_ACTIONS = {
  ADD_FRIEND: "add_friend",
  PAST_ORDER_DATE: "past_order_date",
  EDIT_ORDER_DATE: "edit_order_date",
  EDIT_ORDER_TEXT_PREFIX: "edit_order_text:",
  EDIT_COST_PREFIX: "edit_cost:",
  WINNING_NUMBER_DATE: "winning_number_date",
  WINNING_NUMBER_INPUT_PREFIX: "winning_number_input:",
  DAILY_REPORT_DATE: "daily_report_date"
};
var COST_GAME_TYPES = ["539", "大樂透", "港號"];
var DEFAULT_CAR_GAME_MAX_NUMBER = 39;
var DEFAULT_COST_VALUES_BY_GAME = {
  "539": [70, 75, 80, 70],
  "大樂透": [70, 75, 80, 70],
  "港號": [70, 75, 80, 70]
};
var DEFAULT_PRIZE_VALUES_BY_GAME = {
  "539": [5300, 57e3, 75e4],
  "大樂透": [5300, 57e3, 75e4],
  "港號": [5300, 57e3, 75e4]
};
var DEFAULT_COST_ROWS = COST_GAME_TYPES.map(
  (gameType) => {
    const costValues = DEFAULT_COST_VALUES_BY_GAME[gameType];
    const prizeValues = DEFAULT_PRIZE_VALUES_BY_GAME[gameType];
    return {
      gameType,
      star2Cost: costValues[0],
      star3Cost: costValues[1],
      star4Cost: costValues[2],
      carCost: costValues[3],
      star2Prize: prizeValues[0],
      star3Prize: prizeValues[1],
      star4Prize: prizeValues[2]
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
  const exampleText = formatCostPrizeValues(gameType);
  if (values.length !== 7) {
    throw new Error(`請輸入七個用逗號分隔的數字，例如 ${exampleText}`);
  }
  const numbers = values.map((value) => Number(value));
  if (numbers.some((value) => Number.isNaN(value))) {
    throw new Error(`設定只能包含數字與逗號，例如 ${exampleText}`);
  }
  return buildCostRowFromValues(gameType, numbers);
}
function buildCostRowFromValues(gameType, values) {
  return {
    gameType,
    star2Cost: values[0],
    star3Cost: values[1],
    star4Cost: values[2],
    carCost: values[3],
    star2Prize: values[4],
    star3Prize: values[5],
    star4Prize: values[6]
  };
}
function formatCostPrizeValues(gameType) {
  return [
    ...DEFAULT_COST_VALUES_BY_GAME[gameType],
    ...DEFAULT_PRIZE_VALUES_BY_GAME[gameType]
  ].join(",");
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

// src/orderEdits.js
function buildEditOrderPendingAction(rawMessageId) {
  return `${PENDING_ACTIONS.EDIT_ORDER_TEXT_PREFIX}${rawMessageId}`;
}
function parseEditOrderPendingAction(pendingAction) {
  const rawMessageId = Number(
    String(pendingAction || "").slice(PENDING_ACTIONS.EDIT_ORDER_TEXT_PREFIX.length)
  );
  return { rawMessageId };
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
function formatNumberWithCommas(value) {
  const normalizedValue = formatNumber(value);
  const [integerPart, decimalPart] = normalizedValue.split(".");
  return [
    integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ","),
    decimalPart
  ].filter((part) => part !== void 0).join(".");
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
function parseWinningNumbersText(text) {
  const value = String(text || "").trim();
  if (!value) {
    throw new Error("請輸入開獎號碼。");
  }
  const digits = value.replace(/\D/g, "");
  if (!digits || digits.length % 2 !== 0) {
    throw new Error("開獎號碼需為兩位數一組。");
  }
  const numbers = [];
  for (let index = 0; index < digits.length; index += 2) {
    numbers.push(digits.slice(index, index + 2));
  }
  const uniqueNumbers = [...new Set(numbers)];
  if (uniqueNumbers.length !== numbers.length) {
    throw new Error("開獎號碼不可重複。");
  }
  return numbers;
}

// src/reports.js
function buildCalculationReport(friendName, entries, imageCount = 0, dateText = getTaipeiDateString(), costs = [], winningNumbersByGameType = {}) {
  const totals = { 2: 0, 3: 0, 4: 0, car: 0 };
  const betAmounts = { 2: 0, 3: 0, 4: 0, car: 0 };
  const prizeAmounts = { 2: 0, 3: 0, 4: 0, car: 0 };
  const costByGameType = buildCostByGameType(costs);
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
        betAmounts[calculation.pick] += calculateBetAmount(
          entry.gameType,
          calculation,
          costByGameType
        );
        prizeAmounts[calculation.pick] += calculatePrizeAmount(
          entry,
          calculation,
          costByGameType,
          winningNumbersByGameType
        );
      }
      return `${formatPickLabel(calculation.pick)}${formatNumber(
        calculation.amount
      )}`;
    });
    lines.push(
      `${index + 1}. ${formatEntryGameType(entry)}${entry.sourceLineText}：${calculationTexts.join("、")}`
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
  const totalBetAmount = sumReportAmounts(betAmounts);
  const totalPrizeAmount = sumReportAmounts(prizeAmounts);
  lines.push("");
  lines.push("下注總額");
  lines.push(formatAmountBreakdown(betAmounts));
  lines.push(`合計${formatMoney(totalBetAmount)}`);
  lines.push("");
  lines.push("中獎金額");
  lines.push(formatAmountBreakdown(prizeAmounts));
  lines.push(`合計${formatMoney(totalPrizeAmount)}`);
  lines.push("");
  lines.push("差額");
  lines.push(formatMoney(totalBetAmount - totalPrizeAmount));
  if (imageCount > 0) {
    lines.push("");
    lines.push(`圖片 ${imageCount} 筆尚未解析。`);
  }
  return lines.join("\n");
}
function buildCostReport(friendName, costs) {
  const lines = [`${friendName} 成本與獎金設定`, ""];
  if (costs.length === 0) {
    lines.push("目前尚未設定成本與獎金。查看時會自動套用預設值。");
    return lines.join("\n");
  }
  for (const cost of costs) {
    lines.push(`【${cost.game_type}】`);
    lines.push(
      [
        "成本：",
        `二${formatMoney(cost.star2_cost)}`,
        `三${formatMoney(cost.star3_cost)}`,
        `四${formatMoney(cost.star4_cost)}`,
        `車${formatMoney(cost.car_cost)}`
      ].join(" ")
    );
    lines.push(
      [
        "獎金：",
        `二${formatMoney(cost.star2_prize)}`,
        `三${formatMoney(cost.star3_prize)}`,
        `四${formatMoney(cost.star4_prize)}`,
        `車${formatMoney(cost.star2_prize)}`
      ].join(" ")
    );
    lines.push("");
  }
  return lines.join("\n");
}
function buildDailyTotalReport(dateText, summaries) {
  const totalBetAmount = summaries.reduce(
    (total, summary) => total + summary.betAmount,
    0
  );
  const totalPrizeAmount = summaries.reduce(
    (total, summary) => total + summary.prizeAmount,
    0
  );
  const lines = [`${dateText} 每日總報表`, ""];
  if (summaries.length === 0) {
    lines.push("沒有注單資料。");
    return lines.join("\n");
  }
  for (const summary of summaries) {
    lines.push(
      `${summary.friendName}：下注${formatMoney(summary.betAmount)}、中獎${formatMoney(summary.prizeAmount)}、差額${formatMoney(summary.betAmount - summary.prizeAmount)}`
    );
  }
  lines.push("");
  lines.push(`收入 ${formatMoney(totalBetAmount)}`);
  lines.push(`支出 ${formatMoney(totalPrizeAmount)}`);
  lines.push(`盈虧 ${formatMoney(totalBetAmount - totalPrizeAmount)}`);
  return lines.join("\n");
}
function calculateEntryBetAmount(entry, costs) {
  const costByGameType = buildCostByGameType(costs);
  return entry.calculations.reduce(
    (total, calculation) => total + calculateBetAmount(entry.gameType, calculation, costByGameType),
    0
  );
}
function calculateEntryPrizeAmount(entry, costs, winningNumbersByGameType) {
  const costByGameType = buildCostByGameType(costs);
  return entry.calculations.reduce(
    (total, calculation) => total + calculatePrizeAmount(
      entry,
      calculation,
      costByGameType,
      winningNumbersByGameType
    ),
    0
  );
}
function buildCostByGameType(costs) {
  return Object.fromEntries(costs.map((cost) => [cost.game_type, cost]));
}
function calculateBetAmount(gameType, calculation, costByGameType) {
  const cost = costByGameType[gameType];
  if (!cost) return 0;
  const unitCostByPick = {
    2: cost.star2_cost,
    3: cost.star3_cost,
    4: cost.star4_cost,
    car: cost.car_cost
  };
  return calculation.amount * (unitCostByPick[calculation.pick] || 0);
}
function calculatePrizeAmount(entry, calculation, costByGameType, winningNumbersByGameType) {
  const cost = costByGameType[entry.gameType];
  const winningNumbers = winningNumbersByGameType[entry.gameType];
  if (!cost || !winningNumbers?.length) return 0;
  const unitPrizeByPick = {
    2: cost.star2_prize,
    3: cost.star3_prize,
    4: cost.star4_prize,
    car: cost.star2_prize
  };
  const unitPrize = unitPrizeByPick[calculation.pick] || 0;
  if (!unitPrize) return 0;
  const winningCount = calculateWinningCount(
    entry.rows,
    calculation,
    winningNumbers
  );
  return winningCount * unitPrize;
}
function calculateWinningCount(rows, calculation, winningNumbers) {
  const winningSet = new Set(winningNumbers);
  if (calculation.pick === "car") {
    const targetNumber = rows[0]?.[0];
    if (!targetNumber || !winningSet.has(targetNumber)) return 0;
    const otherWinningCount = (rows[1] || []).filter(
      (number) => winningSet.has(number)
    ).length;
    return otherWinningCount * calculation.multiplier;
  }
  const pick = Number(calculation.pick);
  if (!Number.isInteger(pick) || pick <= 0 || pick > rows.length) return 0;
  let total = 0;
  function visit(startIndex, pickedCount, product) {
    if (pickedCount === pick) {
      total += product;
      return;
    }
    for (let index = startIndex; index < rows.length; index += 1) {
      const matchCount = rows[index].filter(
        (number) => winningSet.has(number)
      ).length;
      if (matchCount > 0) {
        visit(index + 1, pickedCount + 1, product * matchCount);
      }
    }
  }
  visit(0, 0, 1);
  return total * calculation.multiplier;
}
function formatEntryGameType(entry) {
  return entry.gameType ? `[${entry.gameType}] ` : "";
}
function formatAmountBreakdown(amounts) {
  return [
    `二${formatMoney(amounts[2])}`,
    `三${formatMoney(amounts[3])}`,
    `四${formatMoney(amounts[4])}`,
    `車${formatMoney(amounts.car)}`
  ].join("、");
}
function formatMoney(value) {
  return formatNumberWithCommas(value);
}
function sumReportAmounts(amounts) {
  return amounts[2] + amounts[3] + amounts[4] + amounts.car;
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
        current_game_type TEXT,
        pending_action TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (current_friend_id) REFERENCES friends(id)
      )
      `
  ).run();
  await ensureColumn(db, "user_sessions", "pending_action", "TEXT");
  await ensureColumn(db, "user_sessions", "current_game_type", "TEXT");
  await db.prepare(
    `
      CREATE TABLE IF NOT EXISTS raw_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        friend_id INTEGER,
        line_user_id TEXT NOT NULL,
        message_type TEXT NOT NULL,
        game_type TEXT,
        raw_text TEXT,
        image_message_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (friend_id) REFERENCES friends(id)
      )
      `
  ).run();
  await ensureColumn(db, "raw_messages", "game_type", "TEXT");
  await db.prepare(
    `
      CREATE TABLE IF NOT EXISTS parsed_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_message_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        line_user_id TEXT NOT NULL,
        game_type TEXT,
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
  await ensureColumn(db, "parsed_entries", "game_type", "TEXT");
  await db.prepare(
    `
      CREATE TABLE IF NOT EXISTS friend_costs (
        friend_id INTEGER NOT NULL,
        game_type TEXT NOT NULL,
        star2_cost REAL NOT NULL DEFAULT 0,
        star3_cost REAL NOT NULL DEFAULT 0,
        star4_cost REAL NOT NULL DEFAULT 0,
        car_cost REAL NOT NULL DEFAULT 0,
        star2_prize REAL NOT NULL DEFAULT 0,
        star3_prize REAL NOT NULL DEFAULT 0,
        star4_prize REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (friend_id, game_type),
        FOREIGN KEY (friend_id) REFERENCES friends(id)
      )
      `
  ).run();
  await ensureColumn(db, "friend_costs", "star2_prize", "REAL NOT NULL DEFAULT 0");
  await ensureColumn(db, "friend_costs", "star3_prize", "REAL NOT NULL DEFAULT 0");
  await ensureColumn(db, "friend_costs", "star4_prize", "REAL NOT NULL DEFAULT 0");
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
  await db.prepare(
    `
      CREATE TABLE IF NOT EXISTS raw_message_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_message_id INTEGER NOT NULL,
        old_raw_text TEXT,
        new_raw_text TEXT NOT NULL,
        line_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (raw_message_id) REFERENCES raw_messages(id)
      )
      `
  ).run();
  await db.prepare(
    `
      CREATE TABLE IF NOT EXISTS winning_numbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_type TEXT NOT NULL,
        draw_date TEXT NOT NULL,
        numbers_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(game_type, draw_date)
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
      SELECT
        game_type,
        star2_cost,
        star3_cost,
        star4_cost,
        car_cost,
        star2_prize,
        star3_prize,
        star4_prize,
        updated_at
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
    const changed = await ensureFriendCostsComplete(db, friendId, costs);
    costs = changed ? await getFriendCosts(db, friendId) : costs;
    return { costs, usedDefaultCosts: false };
  }
  await saveFriendCosts(db, friendId, DEFAULT_COST_ROWS);
  costs = await getFriendCosts(db, friendId);
  return { costs, usedDefaultCosts: true };
}
async function ensureFriendCostsComplete(db, friendId, costs) {
  let changed = false;
  const existingGameTypes = new Set(costs.map((cost) => cost.game_type));
  for (const defaultRow of DEFAULT_COST_ROWS) {
    if (!existingGameTypes.has(defaultRow.gameType)) {
      await saveFriendCosts(db, friendId, [defaultRow]);
      changed = true;
    }
  }
  for (const cost of costs) {
    const defaultRow = DEFAULT_COST_ROWS.find(
      (row) => row.gameType === cost.game_type
    );
    if (defaultRow && Number(cost.star2_prize) === 0 && Number(cost.star3_prize) === 0 && Number(cost.star4_prize) === 0) {
      await db.prepare(
        `
          UPDATE friend_costs
          SET star2_prize = ?,
              star3_prize = ?,
              star4_prize = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE friend_id = ?
            AND game_type = ?
          `
      ).bind(
        defaultRow.star2Prize,
        defaultRow.star3Prize,
        defaultRow.star4Prize,
        friendId,
        cost.game_type
      ).run();
      changed = true;
    }
  }
  return changed;
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
          star2_prize,
          star3_prize,
          star4_prize,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(friend_id, game_type)
        DO UPDATE SET
          star2_cost = excluded.star2_cost,
          star3_cost = excluded.star3_cost,
          star4_cost = excluded.star4_cost,
          car_cost = excluded.car_cost,
          star2_prize = excluded.star2_prize,
          star3_prize = excluded.star3_prize,
          star4_prize = excluded.star4_prize,
          updated_at = CURRENT_TIMESTAMP
        `
    ).bind(
      friendId,
      row.gameType,
      row.star2Cost,
      row.star3Cost,
      row.star4Cost,
      row.carCost,
      row.star2Prize,
      row.star3Prize,
      row.star4Prize
    ).run();
  }
}
async function setCurrentFriend(db, lineUserId, friendId) {
  await db.prepare(
    `
      INSERT INTO user_sessions (
        line_user_id,
        current_friend_id,
        current_game_type,
        pending_action,
        updated_at
      )
      VALUES (?, ?, NULL, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(line_user_id)
      DO UPDATE SET
        current_friend_id = excluded.current_friend_id,
        current_game_type = NULL,
        pending_action = NULL,
        updated_at = CURRENT_TIMESTAMP
      `
  ).bind(lineUserId, friendId).run();
}
async function setCurrentGameType(db, lineUserId, gameType) {
  await db.prepare(
    `
      INSERT INTO user_sessions (line_user_id, current_game_type, pending_action, updated_at)
      VALUES (?, ?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(line_user_id)
      DO UPDATE SET
        current_game_type = excluded.current_game_type,
        pending_action = NULL,
        updated_at = CURRENT_TIMESTAMP
      `
  ).bind(lineUserId, gameType).run();
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
        user_sessions.current_game_type AS game_type,
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
        game_type,
        raw_text,
        image_message_id
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `
  ).bind(
    message.friendId,
    message.lineUserId,
    message.messageType,
    message.gameType,
    message.rawText,
    message.imageMessageId
  ).run();
  return result.meta?.last_row_id ?? null;
}
async function saveParsedEntriesForText(db, message) {
  if (!message.rawMessageId) return [];
  const entries = parseTextToCalculationEntries(message.rawText);
  for (const entry of entries) {
    await db.prepare(
      `
        INSERT INTO parsed_entries (
          raw_message_id,
          friend_id,
          line_user_id,
          game_type,
          source_line_text,
          number_part,
          rule_part,
          rows_json,
          calculations_json,
          total_amount,
          error_message,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        `
    ).bind(
      message.rawMessageId,
      message.friendId,
      message.lineUserId,
      message.gameType,
      entry.sourceLineText,
      entry.numberPart,
      entry.rulePart,
      JSON.stringify(entry.rows),
      JSON.stringify(entry.calculations),
      entry.totalAmount,
      entry.errorMessage,
      message.createdAt || null
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
        game_type,
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
async function getRawMessageById(db, rawMessageId) {
  return await db.prepare(
    `
      SELECT
        raw_messages.id,
        raw_messages.friend_id,
        raw_messages.line_user_id,
        raw_messages.message_type,
        raw_messages.game_type,
        raw_messages.raw_text,
        raw_messages.image_message_id,
        raw_messages.created_at,
        date(raw_messages.created_at, '+8 hours') AS taipei_date,
        friends.name AS friend_name
      FROM raw_messages
      INNER JOIN friends
        ON friends.id = raw_messages.friend_id
       AND friends.deleted_at IS NULL
      WHERE raw_messages.id = ?
      `
  ).bind(rawMessageId).first();
}
async function getEditableRawMessagesByFriendAndDate(db, friendId, dateText) {
  const result = await db.prepare(
    `
      SELECT
        id,
        friend_id,
        line_user_id,
        game_type,
        raw_text,
        created_at,
        date(created_at, '+8 hours') AS taipei_date
      FROM raw_messages
      WHERE friend_id = ?
        AND message_type = 'text'
        AND raw_text IS NOT NULL
        AND date(created_at, '+8 hours') = ?
      ORDER BY created_at ASC, id ASC
      LIMIT 12
      `
  ).bind(friendId, dateText).all();
  return result.results || [];
}
async function getWinningNumber(db, gameType, drawDate) {
  const row = await db.prepare(
    `
      SELECT id, game_type, draw_date, numbers_json, updated_at
      FROM winning_numbers
      WHERE game_type = ?
        AND draw_date = ?
      `
  ).bind(gameType, drawDate).first();
  if (!row) return null;
  return {
    id: row.id,
    gameType: row.game_type,
    drawDate: row.draw_date,
    numbers: parseJsonOrDefault(row.numbers_json, []),
    updatedAt: row.updated_at
  };
}
async function saveWinningNumber(db, gameType, drawDate, numbers) {
  await db.prepare(
    `
      INSERT INTO winning_numbers (
        game_type,
        draw_date,
        numbers_json,
        updated_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(game_type, draw_date)
      DO UPDATE SET
        numbers_json = excluded.numbers_json,
        updated_at = CURRENT_TIMESTAMP
      `
  ).bind(gameType, drawDate, JSON.stringify(numbers)).run();
}
async function updateRawTextMessageWithRevision(db, rawMessage, newRawText, editorLineUserId) {
  await db.prepare(
    `
      INSERT INTO raw_message_revisions (
        raw_message_id,
        old_raw_text,
        new_raw_text,
        line_user_id
      )
      VALUES (?, ?, ?, ?)
      `
  ).bind(rawMessage.id, rawMessage.raw_text, newRawText, editorLineUserId).run();
  await db.prepare(
    `
      UPDATE raw_messages
      SET raw_text = ?
      WHERE id = ?
        AND message_type = 'text'
      `
  ).bind(newRawText, rawMessage.id).run();
  await db.prepare("DELETE FROM parsed_entries WHERE raw_message_id = ?").bind(rawMessage.id).run();
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
    gameType: row.game_type || "539",
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
async function replyGameTypePicker(replyToken, friend, channelAccessToken) {
  const buttons = COST_GAME_TYPES.map((gameType) => ({
    type: "button",
    style: "primary",
    color: "#06C755",
    action: {
      type: "message",
      label: gameType,
      text: `${INTERNAL_COMMANDS.SELECT_GAME_PREFIX}${gameType}`
    }
  }));
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: "請選擇彩種",
    title: `${friend.name} 下單彩種`,
    description: "選好後，接下來傳入的文字或圖片注單會使用這個彩種計算。",
    buttons
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
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "修改注單",
          text: COMMANDS.EDIT_ORDER
        }
      }
    ]
  });
}
async function replyEditOrderDateMenu(replyToken, channelAccessToken) {
  const today = addDaysToTaipeiDate(0);
  const yesterday = addDaysToTaipeiDate(-1);
  const dayBeforeYesterday = addDaysToTaipeiDate(-2);
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: "修改注單",
    title: "修改注單",
    description: "請先選擇日期，再選擇朋友與要修改的文字注單。",
    buttons: [
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `今天 ${today}`,
          text: `${INTERNAL_COMMANDS.EDIT_ORDER_DATE_PREFIX}${today}`
        }
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `昨天 ${yesterday}`,
          text: `${INTERNAL_COMMANDS.EDIT_ORDER_DATE_PREFIX}${yesterday}`
        }
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `前天 ${dayBeforeYesterday}`,
          text: `${INTERNAL_COMMANDS.EDIT_ORDER_DATE_PREFIX}${dayBeforeYesterday}`
        }
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "特定日期",
          text: `${INTERNAL_COMMANDS.EDIT_ORDER_DATE_PREFIX}指定日期`
        }
      }
    ]
  });
}
async function replyEditOrderFriendPicker(replyToken, friends, dateText, channelAccessToken) {
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
      text: `${INTERNAL_COMMANDS.EDIT_ORDER_FRIEND_PREFIX}${dateText}|${friend.name}`
    }
  }));
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: `請選擇 ${dateText} 修改注單朋友`,
    title: `${dateText} 修改注單`,
    description: "請選擇朋友，下一步會列出可修改的文字注單。",
    buttons
  });
}
async function replyEditOrderMessagePicker(replyToken, friend, dateText, rawMessages, channelAccessToken) {
  if (rawMessages.length === 0) {
    await replyMessage(
      replyToken,
      `${friend.name} ${dateText} 沒有可修改的文字注單。`,
      channelAccessToken
    );
    return;
  }
  const buttons = rawMessages.slice(0, 12).map((message, index) => ({
    type: "button",
    style: "primary",
    color: "#1A73E8",
    action: {
      type: "message",
      label: `${index + 1}. ${buildRawMessageLabel(message.raw_text, index)}`,
      text: `${INTERNAL_COMMANDS.EDIT_ORDER_MESSAGE_PREFIX}${message.id}`
    }
  }));
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: `請選擇 ${friend.name} 要修改的注單`,
    title: `${friend.name} ${dateText}`,
    description: "請選擇要修改的文字注單。每個按鈕代表一則 LINE 文字訊息。",
    buttons
  });
}
async function replyEditOrderInputPrompt(replyToken, rawMessage, channelAccessToken) {
  await replyMessage(
    replyToken,
    [
      "請輸入新的注單內容。",
      "",
      "原內容：",
      rawMessage.raw_text || ""
    ].join("\n"),
    channelAccessToken
  );
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
    altText: "請選擇成本與獎金管理朋友",
    title: "成本與獎金",
    description: "請先選擇朋友，再查看或編輯成本與獎金設定。",
    buttons
  });
}
async function replyCostManagementMenu(replyToken, channelAccessToken) {
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: "成本管理",
    title: "成本管理",
    description: "管理朋友成本與獎金、開獎號碼，或查看每日總報表。",
    buttons: [
      {
        type: "button",
        style: "primary",
        color: "#7B61FF",
        action: {
          type: "message",
          label: "朋友成本與獎金",
          text: COMMANDS.FRIEND_COST_MANAGEMENT
        }
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: "開獎號碼",
          text: COMMANDS.WINNING_NUMBER_MANAGEMENT
        }
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "每日總報表",
          text: COMMANDS.DAILY_TOTAL_REPORT
        }
      }
    ]
  });
}
function buildRawMessageLabel(rawText, index) {
  const singleLineText = String(rawText || "").replace(/\s+/g, " ").trim();
  const prefixLength = `${index + 1}. `.length;
  const maxTextLength = Math.max(6, 20 - prefixLength);
  if (!singleLineText) return "空白注單";
  if (singleLineText.length <= maxTextLength) return singleLineText;
  return `${singleLineText.slice(0, maxTextLength - 3)}...`;
}
async function replyCostActionMenu(replyToken, friend, channelAccessToken) {
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: `成本與獎金：${friend.name}`,
    title: `${friend.name} 成本與獎金`,
    description: "可查看或編輯 539、大樂透、港號的下注成本與中獎金額。",
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
    altText: `編輯成本與獎金：${friend.name}`,
    title: `${friend.name} 編輯成本與獎金`,
    description: "可以直接套用預設值，或改用手動輸入逐項設定。",
    buttons: [
      {
        type: "button",
        style: "primary",
        color: "#06C755",
        action: {
          type: "message",
          label: "套用預設值",
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
  const defaultCostText = formatCostPrizeValues(gameType);
  if (noticeText) {
    contents.push({
      type: "text",
      text: noticeText,
      size: "sm",
      color: noticeText.includes("格式不正確") ? "#D93025" : "#06C755",
      wrap: true
    });
  }
  contents.push(
    {
      type: "text",
      text: `請輸入 ${friendName} 的成本與獎金`,
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
      text: "七個數字請用逗號串接，依序代表二星成本、三星成本、四星成本、車組成本、二星獎金、三星獎金、四星獎金。",
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
          altText: `請輸入「${gameType}」成本與獎金`,
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
async function replyWinningNumberDateMenu(replyToken, channelAccessToken) {
  const today = addDaysToTaipeiDate(0);
  const yesterday = addDaysToTaipeiDate(-1);
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: "開獎號碼",
    title: "開獎號碼",
    description: "請先選日期，再選彩種。輸入新號碼會新增或覆蓋原號碼。",
    buttons: [
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `今天 ${today}`,
          text: `${INTERNAL_COMMANDS.WINNING_NUMBER_DATE_PREFIX}${today}`
        }
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `昨天 ${yesterday}`,
          text: `${INTERNAL_COMMANDS.WINNING_NUMBER_DATE_PREFIX}${yesterday}`
        }
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "特定日期",
          text: `${INTERNAL_COMMANDS.WINNING_NUMBER_DATE_PREFIX}指定日期`
        }
      }
    ]
  });
}
async function replyWinningNumberGamePicker(replyToken, dateText, channelAccessToken) {
  const buttons = COST_GAME_TYPES.map((gameType) => ({
    type: "button",
    style: "primary",
    color: "#1A73E8",
    action: {
      type: "message",
      label: gameType,
      text: `${INTERNAL_COMMANDS.WINNING_NUMBER_GAME_PREFIX}${dateText}|${gameType}`
    }
  }));
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: `請選擇 ${dateText} 開獎彩種`,
    title: `${dateText} 開獎號碼`,
    description: "請選擇要新增、查看或編輯開獎號碼的彩種。",
    buttons
  });
}
async function replyWinningNumberInputPrompt(replyToken, dateText, gameType, winningNumber, channelAccessToken) {
  const lines = [`${dateText} ${gameType} 開獎號碼`];
  if (winningNumber) {
    lines.push(`目前號碼：${winningNumber.numbers.join(" ")}`);
  } else {
    lines.push("目前尚未設定。");
  }
  lines.push("");
  lines.push("請輸入開獎號碼，例如：01 02 03 04 05");
  await replyMessage(replyToken, lines.join("\n"), channelAccessToken);
}
async function replyDailyReportDateMenu(replyToken, channelAccessToken) {
  const today = addDaysToTaipeiDate(0);
  const yesterday = addDaysToTaipeiDate(-1);
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: "每日總報表",
    title: "每日總報表",
    description: "請選擇日期，查看所有朋友的下注收入、中獎支出與盈虧。",
    buttons: [
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `今天 ${today}`,
          text: `${INTERNAL_COMMANDS.DAILY_REPORT_DATE_PREFIX}${today}`
        }
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `昨天 ${yesterday}`,
          text: `${INTERNAL_COMMANDS.DAILY_REPORT_DATE_PREFIX}${yesterday}`
        }
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "特定日期",
          text: `${INTERNAL_COMMANDS.DAILY_REPORT_DATE_PREFIX}指定日期`
        }
      }
    ]
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
  if (session?.pending_action === PENDING_ACTIONS.EDIT_ORDER_DATE) {
    await handlePendingEditOrderDate(event, env, userId, text);
    return;
  }
  if (session?.pending_action?.startsWith(PENDING_ACTIONS.EDIT_ORDER_TEXT_PREFIX)) {
    await handlePendingEditOrderText(event, env, userId, text, session);
    return;
  }
  if (session?.pending_action?.startsWith(PENDING_ACTIONS.EDIT_COST_PREFIX)) {
    await handlePendingEditCost(event, env, userId, text, session);
    return;
  }
  if (session?.pending_action === PENDING_ACTIONS.WINNING_NUMBER_DATE) {
    await handlePendingWinningNumberDate(event, env, userId, text);
    return;
  }
  if (session?.pending_action?.startsWith(PENDING_ACTIONS.WINNING_NUMBER_INPUT_PREFIX)) {
    await handlePendingWinningNumberInput(event, env, userId, text, session);
    return;
  }
  if (session?.pending_action === PENDING_ACTIONS.DAILY_REPORT_DATE) {
    await handlePendingDailyReportDate(event, env, userId, text);
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
  if (text.startsWith(INTERNAL_COMMANDS.EDIT_ORDER_DATE_PREFIX)) {
    const dateText = text.slice(INTERNAL_COMMANDS.EDIT_ORDER_DATE_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleEditOrderDateSelected(event, env, dateText);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.EDIT_ORDER_FRIEND_PREFIX)) {
    const payload = text.slice(INTERNAL_COMMANDS.EDIT_ORDER_FRIEND_PREFIX.length);
    const { dateText, friendName } = parseDateFriendPayload(payload);
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleEditOrderForFriendName(event, env, dateText, friendName);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.EDIT_ORDER_MESSAGE_PREFIX)) {
    const rawMessageId = Number(
      text.slice(INTERNAL_COMMANDS.EDIT_ORDER_MESSAGE_PREFIX.length).trim()
    );
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleEditOrderMessageSelected(event, env, userId, rawMessageId);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.SELECT_GAME_PREFIX)) {
    const gameType = text.slice(INTERNAL_COMMANDS.SELECT_GAME_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleSelectGameType(event, env, userId, gameType);
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
  if (text.startsWith(INTERNAL_COMMANDS.WINNING_NUMBER_DATE_PREFIX)) {
    const dateText = text.slice(INTERNAL_COMMANDS.WINNING_NUMBER_DATE_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleWinningNumberDateSelected(event, env, dateText);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.WINNING_NUMBER_GAME_PREFIX)) {
    const payload = text.slice(INTERNAL_COMMANDS.WINNING_NUMBER_GAME_PREFIX.length);
    const { dateText, friendName: gameType } = parseDateFriendPayload(payload);
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleWinningNumberGameSelected(event, env, userId, dateText, gameType);
    return true;
  }
  if (text.startsWith(INTERNAL_COMMANDS.DAILY_REPORT_DATE_PREFIX)) {
    const dateText = text.slice(INTERNAL_COMMANDS.DAILY_REPORT_DATE_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleDailyReportDateSelected(event, env, dateText);
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
  if (text === COMMANDS.EDIT_ORDER) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleEditOrderCommand(event, env);
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
  if (text === COMMANDS.FRIEND_COST_MANAGEMENT) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleFriendCostManagementCommand(event, env);
    return true;
  }
  if (text === COMMANDS.WINNING_NUMBER_MANAGEMENT) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleWinningNumberManagementCommand(event, env);
    return true;
  }
  if (text === COMMANDS.DAILY_TOTAL_REPORT) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleDailyReportCommand(event, env);
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
  await replyGameTypePicker(
    event.replyToken,
    friend,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleSelectGameType(event, env, userId, gameType) {
  if (!COST_GAME_TYPES.includes(gameType)) {
    await replyMessage(
      event.replyToken,
      `不支援的彩種：${gameType}`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const session = await getCurrentSession(env.DB, userId);
  if (!session?.friend_id) {
    await replyMessage(
      event.replyToken,
      "請先選擇朋友，再選彩種。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await setCurrentGameType(env.DB, userId, gameType);
  await replyMessage(
    event.replyToken,
    `目前下單設定：${session.friend_name}／${gameType}`,
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
async function handleEditOrderCommand(event, env) {
  await replyEditOrderDateMenu(event.replyToken, env.LINE_CHANNEL_ACCESS_TOKEN);
}
async function handleEditOrderDateSelected(event, env, dateText) {
  if (dateText === "指定日期") {
    await setPendingAction(env.DB, event.source.userId, PENDING_ACTIONS.EDIT_ORDER_DATE);
    await replyMessage(
      event.replyToken,
      "請輸入要修改注單的日期，格式 yyyy-MM-dd，例如 2026-05-16。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await handleEditOrderDateCommand(event, env, dateText);
}
async function handlePendingEditOrderDate(event, env, userId, text) {
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
  await handleEditOrderDateCommand(event, env, dateText);
}
async function handleEditOrderDateCommand(event, env, dateText) {
  if (!isValidDateText(dateText)) {
    await replyMessage(
      event.replyToken,
      "日期格式不正確。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const friends = await getFriendsWithOrdersByDate(env.DB, dateText);
  await replyEditOrderFriendPicker(
    event.replyToken,
    friends,
    dateText,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleEditOrderForFriendName(event, env, dateText, friendName) {
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
  const rawMessages = await getEditableRawMessagesByFriendAndDate(
    env.DB,
    friend.id,
    dateText
  );
  await replyEditOrderMessagePicker(
    event.replyToken,
    friend,
    dateText,
    rawMessages,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleEditOrderMessageSelected(event, env, userId, rawMessageId) {
  if (!Number.isInteger(rawMessageId) || rawMessageId <= 0) {
    await replyMessage(
      event.replyToken,
      "找不到要修改的注單。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const rawMessage = await getRawMessageById(env.DB, rawMessageId);
  if (!rawMessage || rawMessage.message_type !== "text") {
    await replyMessage(
      event.replyToken,
      "找不到可修改的文字注單。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await setPendingAction(env.DB, userId, buildEditOrderPendingAction(rawMessage.id));
  await replyEditOrderInputPrompt(
    event.replyToken,
    rawMessage,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handlePendingEditOrderText(event, env, userId, text, session) {
  const { rawMessageId } = parseEditOrderPendingAction(session.pending_action);
  const rawMessage = await getRawMessageById(env.DB, rawMessageId);
  if (!rawMessage || rawMessage.message_type !== "text") {
    await clearPendingAction(env.DB, userId);
    await replyMessage(
      event.replyToken,
      "找不到要修改的文字注單，已取消修改模式。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const newRawText = text.trim();
  if (!newRawText) {
    await replyMessage(
      event.replyToken,
      "新注單內容不能是空白，請重新輸入。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await updateRawTextMessageWithRevision(env.DB, rawMessage, newRawText, userId);
  const parseResult = await parseAndSaveOrderText(env, {
    rawMessageId: rawMessage.id,
    friendId: rawMessage.friend_id,
    lineUserId: userId,
    inputType: "text",
    rawText: newRawText,
    gameType: rawMessage.game_type || "539",
    createdAt: rawMessage.created_at
  });
  await clearPendingAction(env.DB, userId);
  const entries = await getParsedEntriesByFriendAndDate(
    env.DB,
    rawMessage.friend_id,
    rawMessage.taipei_date
  );
  const imageCount = await getImageMessageCountByFriendAndDate(
    env.DB,
    rawMessage.friend_id,
    rawMessage.taipei_date
  );
  const { costs } = await getOrCreateFriendCosts(env.DB, rawMessage.friend_id);
  const winningNumbersByGameType = await getWinningNumbersByDate(env, rawMessage.taipei_date);
  const report = buildCalculationReport(
    rawMessage.friend_name,
    entries,
    imageCount,
    rawMessage.taipei_date,
    costs,
    winningNumbersByGameType
  );
  await replyMessage(
    event.replyToken,
    [
      `已修改 ${rawMessage.friend_name} 的注單。`,
      buildOrderReceivedMessage(rawMessage.friend_name, parseResult),
      "",
      report
    ].join("\n"),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
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
  const { costs } = await getOrCreateFriendCosts(env.DB, friend.id);
  const winningNumbersByGameType = await getWinningNumbersByDate(env, dateText);
  const report = buildCalculationReport(
    friend.name,
    entries,
    imageCount,
    dateText,
    costs,
    winningNumbersByGameType
  );
  await replyMessage(event.replyToken, report, env.LINE_CHANNEL_ACCESS_TOKEN);
}
async function handleCostManagementCommand(event, env) {
  await replyCostManagementMenu(event.replyToken, env.LINE_CHANNEL_ACCESS_TOKEN);
}
async function handleFriendCostManagementCommand(event, env) {
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
    `${friend.name} 尚未設定成本與獎金，已自動套用預設值。`,
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
    [`已套用 ${friend.name} 的預設成本與獎金。`, "", buildCostReport(friend.name, costs)].join(
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
      `成本與獎金格式不正確：${error.message}`
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
      `已暫存「${gameType}」成本與獎金。`
    );
    return;
  }
  await saveFriendCosts(env.DB, friend.id, costRows);
  await clearPendingAction(env.DB, userId);
  const costs = await getFriendCosts(env.DB, friend.id);
  await replyMessage(
    event.replyToken,
    [`已更新 ${friend.name} 的成本與獎金設定。`, "", buildCostReport(friend.name, costs)].join(
      "\n"
    ),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleWinningNumberManagementCommand(event, env) {
  await replyWinningNumberDateMenu(
    event.replyToken,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleWinningNumberDateSelected(event, env, dateText) {
  if (dateText === "指定日期") {
    await setPendingAction(
      env.DB,
      event.source.userId,
      PENDING_ACTIONS.WINNING_NUMBER_DATE
    );
    await replyMessage(
      event.replyToken,
      "請輸入開獎日期，格式 yyyy-MM-dd，例如 2026-05-19。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await handleWinningNumberDate(event, env, dateText);
}
async function handlePendingWinningNumberDate(event, env, userId, text) {
  const dateText = text.trim();
  if (!isValidDateText(dateText)) {
    await replyMessage(
      event.replyToken,
      "日期格式不正確，請輸入 yyyy-MM-dd，例如 2026-05-19。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await clearPendingAction(env.DB, userId);
  await handleWinningNumberDate(event, env, dateText);
}
async function handleWinningNumberDate(event, env, dateText) {
  if (!isValidDateText(dateText)) {
    await replyMessage(
      event.replyToken,
      "日期格式不正確。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await replyWinningNumberGamePicker(
    event.replyToken,
    dateText,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleWinningNumberGameSelected(event, env, userId, dateText, gameType) {
  if (!isValidDateText(dateText)) {
    await replyMessage(
      event.replyToken,
      "日期格式不正確。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  if (!COST_GAME_TYPES.includes(gameType)) {
    await replyMessage(
      event.replyToken,
      `不支援的彩種：${gameType}`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const winningNumber = await getWinningNumber(env.DB, gameType, dateText);
  await setPendingAction(
    env.DB,
    userId,
    `${PENDING_ACTIONS.WINNING_NUMBER_INPUT_PREFIX}${dateText}|${gameType}`
  );
  await replyWinningNumberInputPrompt(
    event.replyToken,
    dateText,
    gameType,
    winningNumber,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handlePendingWinningNumberInput(event, env, userId, text, session) {
  const payload = session.pending_action.slice(
    PENDING_ACTIONS.WINNING_NUMBER_INPUT_PREFIX.length
  );
  const { dateText, friendName: gameType } = parseDateFriendPayload(payload);
  if (!isValidDateText(dateText) || !COST_GAME_TYPES.includes(gameType)) {
    await clearPendingAction(env.DB, userId);
    await replyMessage(
      event.replyToken,
      "開獎號碼設定狀態不正確，已取消。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  let numbers;
  try {
    numbers = parseWinningNumbersText(text);
  } catch (error) {
    const winningNumber = await getWinningNumber(env.DB, gameType, dateText);
    await replyWinningNumberInputPrompt(
      event.replyToken,
      dateText,
      gameType,
      winningNumber,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await saveWinningNumber(env.DB, gameType, dateText, numbers);
  await clearPendingAction(env.DB, userId);
  await replyMessage(
    event.replyToken,
    `已設定 ${dateText} ${gameType} 開獎號碼：${numbers.join(" ")}`,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function handleDailyReportCommand(event, env) {
  await replyDailyReportDateMenu(event.replyToken, env.LINE_CHANNEL_ACCESS_TOKEN);
}
async function handleDailyReportDateSelected(event, env, dateText) {
  if (dateText === "指定日期") {
    await setPendingAction(
      env.DB,
      event.source.userId,
      PENDING_ACTIONS.DAILY_REPORT_DATE
    );
    await replyMessage(
      event.replyToken,
      "請輸入每日總報表日期，格式 yyyy-MM-dd，例如 2026-05-19。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await handleDailyReportForDate(event, env, dateText);
}
async function handlePendingDailyReportDate(event, env, userId, text) {
  const dateText = text.trim();
  if (!isValidDateText(dateText)) {
    await replyMessage(
      event.replyToken,
      "日期格式不正確，請輸入 yyyy-MM-dd，例如 2026-05-19。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  await clearPendingAction(env.DB, userId);
  await handleDailyReportForDate(event, env, dateText);
}
async function handleDailyReportForDate(event, env, dateText) {
  if (!isValidDateText(dateText)) {
    await replyMessage(
      event.replyToken,
      "日期格式不正確。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const friends = await getFriendsWithOrdersByDate(env.DB, dateText);
  const winningNumbersByGameType = await getWinningNumbersByDate(env, dateText);
  const summaries = [];
  for (const friend of friends) {
    const entries = await getParsedEntriesByFriendAndDate(
      env.DB,
      friend.id,
      dateText
    );
    const { costs } = await getOrCreateFriendCosts(env.DB, friend.id);
    const parsedEntries = entries.filter((entry) => !entry.errorMessage);
    const betAmount = parsedEntries.reduce(
      (total, entry) => total + calculateEntryBetAmount(entry, costs),
      0
    );
    const prizeAmount = parsedEntries.reduce(
      (total, entry) => total + calculateEntryPrizeAmount(entry, costs, winningNumbersByGameType),
      0
    );
    summaries.push({
      friendName: friend.name,
      betAmount,
      prizeAmount
    });
  }
  await replyMessage(
    event.replyToken,
    buildDailyTotalReport(dateText, summaries),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}
async function getWinningNumbersByDate(env, dateText) {
  const entries = await Promise.all(
    COST_GAME_TYPES.map(async (gameType) => {
      const winningNumber = await getWinningNumber(env.DB, gameType, dateText);
      return [gameType, winningNumber?.numbers || []];
    })
  );
  return Object.fromEntries(entries);
}
async function handleHelpCommand(event, env) {
  await replyMessage(
    event.replyToken,
    [
      "使用方式：",
      "1. 點「選朋友下單」",
      "2. 選擇要記錄注單的朋友",
      "3. 選擇彩種",
      "4. 傳入這位朋友的文字或圖片注單",
      "5. 點「今日注單」查看今天的注單與支數統計",
      "",
      "過往注單：",
      "可選昨天、前天或輸入特定日期，再選朋友查看。",
      "要修改注單時，點「過往注單」裡的「修改注單」，選日期、朋友與原始文字注單後，再輸入新的內容。",
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
  if (!session?.game_type) {
    await replyMessage(
      event.replyToken,
      "請先選擇彩種，再傳入資料。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const rawMessageId = await saveRawMessage(env.DB, {
    friendId: session.friend_id,
    lineUserId: userId,
    messageType: "text",
    gameType: session.game_type,
    rawText: text,
    imageMessageId: null
  });
  const parseResult = await parseAndSaveOrderText(env, {
    rawMessageId,
    friendId: session.friend_id,
    lineUserId: userId,
    inputType: "text",
    gameType: session.game_type,
    rawText: text
  });
  await replyMessage(
    event.replyToken,
    buildOrderReceivedMessage(`${session.friend_name}／${session.game_type}`, parseResult),
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
      `朋友已存在：${existingFriend.name}`,
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
  if (session?.pending_action === PENDING_ACTIONS.EDIT_ORDER_DATE) {
    await replyMessage(
      event.replyToken,
      "請輸入文字日期，格式 yyyy-MM-dd，不要傳圖片。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  if (session?.pending_action?.startsWith(PENDING_ACTIONS.EDIT_ORDER_TEXT_PREFIX)) {
    await replyMessage(
      event.replyToken,
      "請輸入新的文字注單內容，不要傳圖片。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  if (session?.pending_action === PENDING_ACTIONS.WINNING_NUMBER_DATE || session?.pending_action?.startsWith(PENDING_ACTIONS.WINNING_NUMBER_INPUT_PREFIX) || session?.pending_action === PENDING_ACTIONS.DAILY_REPORT_DATE) {
    await replyMessage(
      event.replyToken,
      "目前流程需要輸入文字，不要傳圖片。",
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
  if (!session?.game_type) {
    await replyMessage(
      event.replyToken,
      "請先選擇彩種，再傳入圖片。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }
  const rawMessageId = await saveRawMessage(env.DB, {
    friendId: session.friend_id,
    lineUserId: userId,
    messageType: "image",
    gameType: session.game_type,
    rawText: null,
    imageMessageId: event.message.id
  });
  if (!hasOpenAIConfig(env)) {
    await replyMessage(
      event.replyToken,
      [
        `已收到 ${session.friend_name}／${session.game_type} 的圖片注單。`,
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
    gameType: session.game_type,
    messageId: event.message.id
  });
  await replyMessage(
    event.replyToken,
    buildOrderReceivedMessage(`${session.friend_name}／${session.game_type}`, parseResult),
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
    gameType: message.gameType,
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
