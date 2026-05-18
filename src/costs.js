import {
  DEFAULT_COST_VALUES_BY_GAME,
  DEFAULT_PRIZE_VALUES_BY_GAME,
  PENDING_ACTIONS,
} from './constants.js';

export function parseCostCsvLine(gameType, text) {
  const values = String(text || "")
    .trim()
    .split(",")
    .map((value) => value.trim());
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

export function buildCostRowFromValues(gameType, values) {
  return {
    gameType,
    star2Cost: values[0],
    star3Cost: values[1],
    star4Cost: values[2],
    carCost: values[3],
    star2Prize: values[4],
    star3Prize: values[5],
    star4Prize: values[6],
  };
}

export function formatCostValues(values) {
  return values.join(",");
}

export function formatCostPrizeValues(gameType) {
  return [
    ...DEFAULT_COST_VALUES_BY_GAME[gameType],
    ...DEFAULT_PRIZE_VALUES_BY_GAME[gameType],
  ].join(",");
}

export function buildEditCostPendingAction(friendId, gameIndex, costRows) {
  return `${PENDING_ACTIONS.EDIT_COST_PREFIX}${friendId}:${gameIndex}:${encodeURIComponent(
    JSON.stringify(costRows)
  )}`;
}

export function parseEditCostPendingAction(pendingAction) {
  const payload = pendingAction.slice(PENDING_ACTIONS.EDIT_COST_PREFIX.length);
  const [friendIdText, gameIndexText, encodedRows = "%5B%5D"] = payload.split(":");

  return {
    friendId: Number(friendIdText),
    gameIndex: Number(gameIndexText),
    costRows: JSON.parse(decodeURIComponent(encodedRows)),
  };
}
