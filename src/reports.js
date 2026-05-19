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
  costs = [],
  winningNumbersByGameType = {}
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
      `${formatPickLabel(2)}${formatNumber(totals[2])}`,
      `${formatPickLabel(3)}${formatNumber(totals[3])}`,
      `${formatPickLabel(4)}${formatNumber(totals[4])}`,
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
        `${formatPickLabel(2)}${formatMoney(cost.star2_cost)}`,
        `${formatPickLabel(3)}${formatMoney(cost.star3_cost)}`,
        `${formatPickLabel(4)}${formatMoney(cost.star4_cost)}`,
        `車${formatMoney(cost.car_cost)}`,
      ].join(" ")
    );
    lines.push(
      [
        "獎金：",
        `${formatPickLabel(2)}${formatMoney(cost.star2_prize)}`,
        `${formatPickLabel(3)}${formatMoney(cost.star3_prize)}`,
        `${formatPickLabel(4)}${formatMoney(cost.star4_prize)}`,
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

export function calculateEntryPrizeAmount(
  entry,
  costs,
  winningNumbersByGameType
) {
  const costByGameType = buildCostByGameType(costs);

  return entry.calculations.reduce(
    (total, calculation) =>
      total +
      calculatePrizeAmount(
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
    car: cost.car_cost,
  };

  return calculation.amount * (unitCostByPick[calculation.pick] || 0);
}

function calculatePrizeAmount(
  entry,
  calculation,
  costByGameType,
  winningNumbersByGameType
) {
  const cost = costByGameType[entry.gameType];
  const winningNumbers = winningNumbersByGameType[entry.gameType];

  if (!cost || !winningNumbers?.length) return 0;

  const unitPrizeByPick = {
    2: cost.star2_prize,
    3: cost.star3_prize,
    4: cost.star4_prize,
    car: cost.star2_prize,
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

    const otherWinningCount = (rows[1] || []).filter((number) =>
      winningSet.has(number)
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
      const matchCount = rows[index].filter((number) =>
        winningSet.has(number)
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
    `${formatPickLabel(2)}${formatMoney(amounts[2])}`,
    `${formatPickLabel(3)}${formatMoney(amounts[3])}`,
    `${formatPickLabel(4)}${formatMoney(amounts[4])}`,
    `車${formatMoney(amounts.car)}`,
  ].join("、");
}

function formatMoney(value) {
  return formatNumberWithCommas(value);
}

function sumReportAmounts(amounts) {
  return amounts[2] + amounts[3] + amounts[4] + amounts.car;
}
