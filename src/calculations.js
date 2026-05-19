import {
  DEFAULT_CAR_GAME_MAX_NUMBER,
  GAME_NUMBER_MAX_BY_TYPE,
} from './constants.js';

export function parseTextToCalculationEntries(text, gameType = "539") {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseCalculationLine(line, gameType));
}

function parseCalculationLine(line, gameType) {
  const carEntry = parseCarCalculationLine(line, gameType);
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
    errorMessage: null,
  };

  try {
    if (!numberPart || !rulePart) {
      throw new Error("缺少號碼區或規則區");
    }

    const rows = parseNumberRows(numberPart, gameType);
    validateNoDuplicateNumbers(rows);
    const rules = parseCalculationRules(rulePart);

    entry.rows = rows;
    entry.calculations = rules.flatMap((rule) =>
      rule.picks.map((pick) => {
        const baseCount = calculateRowCombinationCount(rows, pick);
        const amount = baseCount * rule.multiplier;

        return {
          pick,
          baseCount,
          multiplier: rule.multiplier,
          amount,
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

function parseCarCalculationLine(line, gameType = "539") {
  const normalized = String(line)
    .trim()
    .replace(/[×＊*]/g, "x")
    .replace(/X/g, "x");
  const match = normalized.match(/^(\d{1,2})\s*x\s*([0-9]+(?:\.[0-9]+)?)\s*車$/);

  if (!match) return null;

  const targetNumber = match[1].padStart(2, "0");
  const multiplier = Number(match[2]);
  const maxNumber = getGameNumberMax(gameType) || DEFAULT_CAR_GAME_MAX_NUMBER;
  const allNumbers = buildGameNumbers(maxNumber);
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
        amount,
      },
    ],
    totalAmount: amount,
    errorMessage: allNumbers.includes(targetNumber)
      ? null
      : `車組號碼超出 ${gameType} 範圍：${targetNumber}`,
  };
}

function buildGameNumbers(maxNumber) {
  const numbers = [];

  for (let number = 1; number <= maxNumber; number += 1) {
    numbers.push(String(number).padStart(2, "0"));
  }

  return numbers;
}

function parseNumberRows(numberPart, gameType = "539") {
  const normalized = String(numberPart)
    .trim()
    .replace(/[×＊*]/g, "x")
    .replace(/X/g, "x");

  validateNumberPartFormat(normalized);

  const rowTexts = normalized.includes("x")
    ? splitBySeparator(normalized, "x", numberPart)
    : normalized.includes(".")
      ? splitBySeparator(normalized, ".", numberPart)
      : splitIntoTwoDigitNumbers(normalized);

  const rows = rowTexts.map((rowText) => splitIntoTwoDigitNumbers(rowText));

  if (rows.length === 0 || rows.some((row) => row.length === 0)) {
    throw new Error("號碼區沒有可用號碼");
  }

  validateNumberRanges(rows, gameType);

  return rows;
}

function validateNumberPartFormat(value) {
  if (!/^[0-9x.]+$/.test(value)) {
    throw new Error("號碼區格式不正確，只能使用數字、x 或 . 分隔");
  }

  if (/[x.]{2,}/.test(value) || /^[x.]|[x.]$/.test(value)) {
    throw new Error(`號碼區分隔格式不正確：${value}`);
  }

  if (value.includes("x") && value.includes(".")) {
    throw new Error("號碼區不可同時使用 x 和 . 分隔");
  }
}

function splitBySeparator(value, separator, originalValue) {
  const escapedSeparator = separator === "." ? "\\." : separator;
  const parts = value.split(new RegExp(escapedSeparator));

  if (parts.some((part) => part.length === 0)) {
    throw new Error(`號碼區分隔格式不正確：${originalValue}`);
  }

  return parts;
}

function splitIntoTwoDigitNumbers(value) {
  const digits = String(value);

  if (!digits) return [];

  if (!/^\d+$/.test(digits)) {
    throw new Error(`號碼區格式不正確：${value}`);
  }

  if (digits.length % 2 !== 0) {
    throw new Error(`號碼區位數不是偶數：${value}`);
  }

  const numbers = [];
  for (let index = 0; index < digits.length; index += 2) {
    numbers.push(digits.slice(index, index + 2));
  }

  return numbers;
}

function validateNumberRanges(rows, gameType) {
  const maxNumber = getGameNumberMax(gameType);
  const label = gameType || "539";

  for (const row of rows) {
    for (const numberText of row) {
      const number = Number(numberText);

      if (!Number.isInteger(number) || number < 1 || number > maxNumber) {
        throw new Error(`${label} 號碼超出範圍：${numberText}`);
      }
    }
  }
}

function validateNoDuplicateNumbers(rows) {
  const seen = new Set();

  for (const row of rows) {
    for (const number of row) {
      if (seen.has(number)) {
        throw new Error(`號碼重複：${number}`);
      }

      seen.add(number);
    }
  }
}

function getGameNumberMax(gameType) {
  return GAME_NUMBER_MAX_BY_TYPE[gameType] || GAME_NUMBER_MAX_BY_TYPE["539"];
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
    十: 10,
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
