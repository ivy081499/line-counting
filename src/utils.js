export function formatPickLabel(pick) {
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
    car: "車",
  };

  return labels[pick] || String(pick);
}

export function formatNumber(value) {
  return Number(value.toFixed(4)).toString();
}

export function formatNumberWithCommas(value) {
  const normalizedValue = formatNumber(value);
  const [integerPart, decimalPart] = normalizedValue.split(".");

  return [
    integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ","),
    decimalPart,
  ]
    .filter((part) => part !== undefined)
    .join(".");
}

export function parseDateFriendPayload(payload) {
  const [dateText = "", ...friendNameParts] = String(payload || "").split("|");

  return {
    dateText: dateText.trim(),
    friendName: friendNameParts.join("|").trim(),
  };
}

export function isValidDateText(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return false;

  const date = new Date(`${dateText}T00:00:00+08:00`);
  return !Number.isNaN(date.getTime()) && getTaipeiDateString(date) === dateText;
}

export function addDaysToTaipeiDate(days) {
  const now = new Date();
  const taipeiNoon = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now) + "T12:00:00+08:00"
  );

  taipeiNoon.setUTCDate(taipeiNoon.getUTCDate() + days);
  return getTaipeiDateString(taipeiNoon);
}

export function getTaipeiDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function isAllowedUser(userId, allowedUserIds) {
  if (!userId || !allowedUserIds) return false;

  return allowedUserIds
    .split(",")
    .map((id) => id.trim())
    .includes(userId);
}

export function parseWinningNumbersText(text) {
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
