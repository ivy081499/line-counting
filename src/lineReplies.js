import {
  COMMANDS,
  COST_GAME_TYPES,
  INTERNAL_COMMANDS,
} from './constants.js';
import { formatCostPrizeValues } from './costs.js';
import { addDaysToTaipeiDate } from './utils.js';

export async function replyMessage(replyToken, text, channelAccessToken) {
  await replyLineMessages(
    replyToken,
    [
      {
        type: "text",
        text,
      },
    ],
    channelAccessToken
  );
}

export async function replyButtonMenu(
  replyToken,
  channelAccessToken,
  { altText, title, description, buttons }
) {
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
                size: "lg",
              },
              {
                type: "text",
                text: description,
                size: "sm",
                color: "#666666",
                wrap: true,
              },
              {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: buttons,
              },
            ],
          },
        },
      },
    ],
    channelAccessToken
  );
}

export async function replyLineMessages(replyToken, messages, channelAccessToken) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });
}

export async function replyFriendPicker(replyToken, friends, channelAccessToken) {
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
      text: `#${friend.name}`,
    },
  }));

  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
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
                  size: "lg",
                },
                {
                  type: "text",
                  text: "選好後，接下來傳入的資料會記錄到目前來源。",
                  size: "sm",
                  color: "#666666",
                  wrap: true,
                },
                {
                  type: "box",
                  layout: "vertical",
                  spacing: "sm",
                  contents: buttons,
                },
              ],
            },
          },
        },
      ],
    }),
  });
}

export async function replyGameTypePicker(
  replyToken,
  friend,
  channelAccessToken
) {
  const buttons = COST_GAME_TYPES.map((gameType) => ({
    type: "button",
    style: "primary",
    color: "#06C755",
    action: {
      type: "message",
      label: gameType,
      text: `${INTERNAL_COMMANDS.SELECT_GAME_PREFIX}${gameType}`,
    },
  }));

  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: "請選擇彩種",
    title: `${friend.name} 下單彩種`,
    description: "選好後，接下來傳入的文字或圖片注單會使用這個彩種計算。",
    buttons,
  });
}

export async function replyFriendManagementMenu(replyToken, channelAccessToken) {
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
          text: COMMANDS.ADD_FRIEND,
        },
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: "查看朋友列表",
          text: COMMANDS.FRIEND_LIST,
        },
      },
      {
        type: "button",
        style: "primary",
        color: "#D93025",
        action: {
          type: "message",
          label: "刪除朋友",
          text: COMMANDS.DELETE_FRIEND,
        },
      },
    ],
  });
}

export async function replyDeleteFriendPicker(replyToken, friends, channelAccessToken) {
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
      text: `!刪除朋友:${friend.name}`,
    },
  }));

  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
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
                  size: "lg",
                },
                {
                  type: "text",
                  text: "刪除後會從名單隱藏，已記錄資料不會刪除。",
                  size: "sm",
                  color: "#666666",
                  wrap: true,
                },
                {
                  type: "box",
                  layout: "vertical",
                  spacing: "sm",
                  contents: buttons,
                },
              ],
            },
          },
        },
      ],
    }),
  });
}

export async function replyDeleteFriendConfirmation(
  replyToken,
  friend,
  channelAccessToken
) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
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
                  size: "lg",
                },
                {
                  type: "text",
                  text: `確定要刪除 ${friend.name} 嗎？`,
                  size: "md",
                  wrap: true,
                },
                {
                  type: "text",
                  text: "刪除後會從名單隱藏，已記錄注單與報表資料不會刪除。",
                  size: "sm",
                  color: "#666666",
                  wrap: true,
                },
              ],
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
                    text: `${INTERNAL_COMMANDS.CONFIRM_DELETE_FRIEND_PREFIX}${friend.name}`,
                  },
                },
                {
                  type: "button",
                  style: "secondary",
                  action: {
                    type: "message",
                    label: "取消",
                    text: INTERNAL_COMMANDS.CANCEL_DELETE_FRIEND,
                  },
                },
              ],
            },
          },
        },
      ],
    }),
  });
}

export async function replyPastOrdersMenu(replyToken, channelAccessToken) {
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
          text: `${INTERNAL_COMMANDS.PAST_ORDER_DATE_PREFIX}${yesterday}`,
        },
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `前天 ${dayBeforeYesterday}`,
          text: `${INTERNAL_COMMANDS.PAST_ORDER_DATE_PREFIX}${dayBeforeYesterday}`,
        },
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "特定日期",
          text: `${INTERNAL_COMMANDS.PAST_ORDER_DATE_PREFIX}指定日期`,
        },
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "修改注單",
          text: COMMANDS.EDIT_ORDER,
        },
      },
    ],
  });
}

export async function replyEditOrderDateMenu(replyToken, channelAccessToken) {
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
          text: `${INTERNAL_COMMANDS.EDIT_ORDER_DATE_PREFIX}${today}`,
        },
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `昨天 ${yesterday}`,
          text: `${INTERNAL_COMMANDS.EDIT_ORDER_DATE_PREFIX}${yesterday}`,
        },
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `前天 ${dayBeforeYesterday}`,
          text: `${INTERNAL_COMMANDS.EDIT_ORDER_DATE_PREFIX}${dayBeforeYesterday}`,
        },
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "特定日期",
          text: `${INTERNAL_COMMANDS.EDIT_ORDER_DATE_PREFIX}指定日期`,
        },
      },
    ],
  });
}

export async function replyEditOrderFriendPicker(
  replyToken,
  friends,
  dateText,
  channelAccessToken
) {
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
      text: `${INTERNAL_COMMANDS.EDIT_ORDER_FRIEND_PREFIX}${dateText}|${friend.name}`,
    },
  }));

  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: `請選擇 ${dateText} 修改注單朋友`,
    title: `${dateText} 修改注單`,
    description: "請選擇朋友，下一步會列出可修改的文字注單。",
    buttons,
  });
}

export async function replyEditOrderMessagePicker(
  replyToken,
  friend,
  dateText,
  rawMessages,
  channelAccessToken
) {
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
      text: `${INTERNAL_COMMANDS.EDIT_ORDER_MESSAGE_PREFIX}${message.id}`,
    },
  }));

  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: `請選擇 ${friend.name} 要修改的注單`,
    title: `${friend.name} ${dateText}`,
    description: "請選擇要修改的文字注單。每個按鈕代表一則 LINE 文字訊息。",
    buttons,
  });
}

export async function replyEditOrderInputPrompt(
  replyToken,
  rawMessage,
  channelAccessToken
) {
  await replyMessage(
    replyToken,
    [
      "請輸入新的注單內容。",
      "",
      "原內容：",
      rawMessage.raw_text || "",
    ].join("\n"),
    channelAccessToken
  );
}

export async function replyOrderReportFriendPicker(
  replyToken,
  friends,
  dateText,
  channelAccessToken
) {
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
      text: `${INTERNAL_COMMANDS.ORDER_REPORT_PREFIX}${dateText}|${friend.name}`,
    },
  }));

  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: `請選擇 ${dateText} 注單朋友`,
    title: `${dateText} 注單`,
    description: "請選擇要查看注單與支數統計的朋友。",
    buttons,
  });
}

export async function replyCostManagementFriendPicker(
  replyToken,
  friends,
  channelAccessToken
) {
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
      text: `${INTERNAL_COMMANDS.COST_MANAGEMENT_PREFIX}${friend.name}`,
    },
  }));

  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: "請選擇成本與獎金管理朋友",
    title: "成本與獎金",
    description: "請先選擇朋友，再查看或編輯成本與獎金設定。",
    buttons,
  });
}

export async function replyCostManagementMenu(
  replyToken,
  channelAccessToken,
  reportUrl
) {
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
          text: COMMANDS.FRIEND_COST_MANAGEMENT,
        },
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: "開獎號碼",
          text: COMMANDS.WINNING_NUMBER_MANAGEMENT,
        },
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: reportUrl ? "uri" : "message",
          label: "每日總報表",
          ...(reportUrl
            ? { uri: reportUrl }
            : { text: COMMANDS.DAILY_TOTAL_REPORT }),
        },
      },
    ],
  });
}

function buildRawMessageLabel(rawText, index) {
  const singleLineText = String(rawText || "")
    .replace(/\s+/g, " ")
    .trim();
  const prefixLength = `${index + 1}. `.length;
  const maxTextLength = Math.max(6, 20 - prefixLength);

  if (!singleLineText) return "空白注單";
  if (singleLineText.length <= maxTextLength) return singleLineText;

  return `${singleLineText.slice(0, maxTextLength - 3)}...`;
}

export async function replyCostActionMenu(replyToken, friend, channelAccessToken) {
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
          text: `${INTERNAL_COMMANDS.VIEW_COST_PREFIX}${friend.name}`,
        },
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "編輯成本",
          text: `${INTERNAL_COMMANDS.EDIT_COST_PREFIX}${friend.name}`,
        },
      },
    ],
  });
}

export async function replyCostEditModeMenu(replyToken, friend, channelAccessToken) {
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
          text: `${INTERNAL_COMMANDS.APPLY_DEFAULT_COST_PREFIX}${friend.name}`,
        },
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "手動輸入",
          text: `${INTERNAL_COMMANDS.MANUAL_EDIT_COST_PREFIX}${friend.name}`,
        },
      },
    ],
  });
}

export async function replyCostInputPrompt(
  replyToken,
  friendName,
  gameType,
  channelAccessToken,
  noticeText = null
) {
  const contents = [];
  const defaultCostText = formatCostPrizeValues(gameType);

  if (noticeText) {
    contents.push({
      type: "text",
      text: noticeText,
      size: "sm",
      color: noticeText.includes("格式不正確") ? "#D93025" : "#06C755",
      wrap: true,
    });
  }

  contents.push(
    {
      type: "text",
      text: `請輸入 ${friendName} 的成本與獎金`,
      size: "sm",
      color: "#666666",
      wrap: true,
    },
    {
      type: "text",
      text: `「${gameType}」`,
      weight: "bold",
      size: "xl",
      wrap: true,
    },
    {
      type: "text",
      text: `格式：${defaultCostText}`,
      size: "md",
      color: "#111111",
      wrap: true,
    },
    {
      type: "text",
      text: "七個數字請用逗號串接，依序代表二♥成本、三♥成本、四♥成本、車組成本、二♥獎金、三♥獎金、四♥獎金。",
      size: "sm",
      color: "#666666",
      wrap: true,
    }
  );

  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
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
              contents,
            },
          },
        },
      ],
    }),
  });
}

export async function replyWinningNumberDateMenu(replyToken, channelAccessToken) {
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
          text: `${INTERNAL_COMMANDS.WINNING_NUMBER_DATE_PREFIX}${today}`,
        },
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `昨天 ${yesterday}`,
          text: `${INTERNAL_COMMANDS.WINNING_NUMBER_DATE_PREFIX}${yesterday}`,
        },
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "特定日期",
          text: `${INTERNAL_COMMANDS.WINNING_NUMBER_DATE_PREFIX}指定日期`,
        },
      },
    ],
  });
}

export async function replyWinningNumberGamePicker(
  replyToken,
  dateText,
  channelAccessToken
) {
  const buttons = COST_GAME_TYPES.map((gameType) => ({
    type: "button",
    style: "primary",
    color: "#1A73E8",
    action: {
      type: "message",
      label: gameType,
      text: `${INTERNAL_COMMANDS.WINNING_NUMBER_GAME_PREFIX}${dateText}|${gameType}`,
    },
  }));

  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: `請選擇 ${dateText} 開獎彩種`,
    title: `${dateText} 開獎號碼`,
    description: "請選擇要新增、查看或編輯開獎號碼的彩種。",
    buttons,
  });
}

export async function replyWinningNumberInputPrompt(
  replyToken,
  dateText,
  gameType,
  winningNumber,
  channelAccessToken
) {
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

export async function replyDailyReportDateMenu(replyToken, channelAccessToken) {
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
          text: `${INTERNAL_COMMANDS.DAILY_REPORT_DATE_PREFIX}${today}`,
        },
      },
      {
        type: "button",
        style: "primary",
        color: "#1A73E8",
        action: {
          type: "message",
          label: `昨天 ${yesterday}`,
          text: `${INTERNAL_COMMANDS.DAILY_REPORT_DATE_PREFIX}${yesterday}`,
        },
      },
      {
        type: "button",
        style: "secondary",
        action: {
          type: "message",
          label: "特定日期",
          text: `${INTERNAL_COMMANDS.DAILY_REPORT_DATE_PREFIX}指定日期`,
        },
      },
    ],
  });
}
