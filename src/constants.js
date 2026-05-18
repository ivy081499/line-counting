export const COMMANDS = {
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
  HELP: "說明",
};

export const INTERNAL_COMMANDS = {
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
  DAILY_REPORT_DATE_PREFIX: "!每日報表日期:",
};

export const PENDING_ACTIONS = {
  ADD_FRIEND: "add_friend",
  PAST_ORDER_DATE: "past_order_date",
  EDIT_ORDER_DATE: "edit_order_date",
  EDIT_ORDER_TEXT_PREFIX: "edit_order_text:",
  EDIT_COST_PREFIX: "edit_cost:",
  WINNING_NUMBER_DATE: "winning_number_date",
  WINNING_NUMBER_INPUT_PREFIX: "winning_number_input:",
  DAILY_REPORT_DATE: "daily_report_date",
};

export const COST_GAME_TYPES = ["539", "大樂透", "港號"];
export const DEFAULT_CAR_GAME_MAX_NUMBER = 39;
export const DEFAULT_COST_VALUES_BY_GAME = {
  "539": [70, 75, 80, 70],
  "大樂透": [70, 75, 80, 70],
  "港號": [70, 75, 80, 70],
};
export const DEFAULT_PRIZE_VALUES_BY_GAME = {
  "539": [5300, 57000, 750000],
  "大樂透": [5300, 57000, 750000],
  "港號": [5300, 57000, 750000],
};
export const DEFAULT_COST_ROWS = COST_GAME_TYPES.map((gameType) =>
  {
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
      star4Prize: prizeValues[2],
    };
  }
);
