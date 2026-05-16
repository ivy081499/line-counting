export const COMMANDS = {
  SELECT_FRIEND_FOR_BET: "選朋友下單",
  ADD_FRIEND: "新增朋友",
  DELETE_FRIEND: "刪除朋友",
  FRIEND_LIST: "查看朋友列表",
  TODAY_ORDERS: "今日注單",
  PAST_ORDERS: "過往注單",
  FRIEND_MANAGEMENT: "朋友管理",
  COST_MANAGEMENT: "成本管理",
  HELP: "說明",
};

export const INTERNAL_COMMANDS = {
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
  MANUAL_EDIT_COST_PREFIX: "!手動編輯成本:",
};

export const PENDING_ACTIONS = {
  ADD_FRIEND: "add_friend",
  PAST_ORDER_DATE: "past_order_date",
  EDIT_COST_PREFIX: "edit_cost:",
};

export const COST_GAME_TYPES = ["539", "大樂透", "港號"];
export const DEFAULT_CAR_GAME_MAX_NUMBER = 39;
export const DEFAULT_COST_VALUES_BY_GAME = {
  "539": [70, 75, 80, 70],
  "大樂透": [70, 75, 80, 70],
  "港號": [70, 75, 80, 70],
};
export const DEFAULT_COST_ROWS = COST_GAME_TYPES.map((gameType) =>
  {
    const values = DEFAULT_COST_VALUES_BY_GAME[gameType];

    return {
      gameType,
      star2Cost: values[0],
      star3Cost: values[1],
      star4Cost: values[2],
      carCost: values[3],
    };
  }
);
