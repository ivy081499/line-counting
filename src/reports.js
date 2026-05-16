import { formatNumber, formatPickLabel, getTaipeiDateString } from './utils.js';

export function buildCalculationReport(
  friendName,
  entries,
  imageCount = 0,
  dateText = getTaipeiDateString()
) {
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
      if (totals[calculation.pick] !== undefined) {
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
      `車${formatNumber(totals.car)}`,
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

export function buildCostReport(friendName, costs) {
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
        `車${formatNumber(cost.car_cost)}`,
      ].join(" ")
    );
  }

  return lines.join("\n");
}
