import {
  formatNumber,
  formatNumberWithCommas,
  formatPickLabel,
  getTaipeiDateString,
} from './utils.js';

export function buildCalculationReport(
  friendName,
  entries,
  imageCount = 0,
  dateText = getTaipeiDateString(),
  costs = []
) {
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
      if (totals[calculation.pick] !== undefined) {
        totals[calculation.pick] += calculation.amount;
        betAmounts[calculation.pick] += calculateBetAmount(
          entry.gameType,
          calculation,
          costByGameType
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
      `車${formatNumber(totals.car)}`,
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

export function buildCostReport(friendName, costs) {
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
        `車${formatMoney(cost.car_cost)}`,
      ].join(" ")
    );
    lines.push(
      [
        "獎金：",
        `二${formatMoney(cost.star2_prize)}`,
        `三${formatMoney(cost.star3_prize)}`,
        `四${formatMoney(cost.star4_prize)}`,
        `車${formatMoney(cost.star2_prize)}`,
      ].join(" ")
    );
    lines.push("");
  }

  return lines.join("\n");
}

export function buildDailyTotalReport(dateText, summaries) {
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

export function calculateEntryBetAmount(entry, costs) {
  const costByGameType = buildCostByGameType(costs);

  return entry.calculations.reduce(
    (total, calculation) =>
      total + calculateBetAmount(entry.gameType, calculation, costByGameType),
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
    car: cost.car_cost,
  };

  return calculation.amount * (unitCostByPick[calculation.pick] || 0);
}

function formatEntryGameType(entry) {
  return entry.gameType ? `[${entry.gameType}] ` : "";
}

function formatAmountBreakdown(amounts) {
  return [
    `二${formatMoney(amounts[2])}`,
    `三${formatMoney(amounts[3])}`,
    `四${formatMoney(amounts[4])}`,
    `車${formatMoney(amounts.car)}`,
  ].join("、");
}

function formatMoney(value) {
  return formatNumberWithCommas(value);
}

function sumReportAmounts(amounts) {
  return amounts[2] + amounts[3] + amounts[4] + amounts.car;
}
