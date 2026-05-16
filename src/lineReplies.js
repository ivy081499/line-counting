import { COMMANDS, DEFAULT_COST_VALUES_BY_GAME, INTERNAL_COMMANDS } from './constants.js';
import { formatCostValues } from './costs.js';
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
    ],
  });
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
    altText: "請選擇成本管理朋友",
    title: "成本管理",
    description: "請先選擇朋友，再查看或編輯成本設定。",
    buttons,
  });
}

export async function replyCostActionMenu(replyToken, friend, channelAccessToken) {
  await replyButtonMenu(replyToken, channelAccessToken, {
    altText: `成本管理：${friend.name}`,
    title: `${friend.name} 成本管理`,
    description: "可查看或編輯 539、大樂透、港號與車的成本。",
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
    altText: `編輯成本：${friend.name}`,
    title: `${friend.name} 編輯成本`,
    description: "可以直接套用預設成本，或改用手動輸入逐項設定。",
    buttons: [
      {
        type: "button",
        style: "primary",
        color: "#06C755",
        action: {
          type: "message",
          label: "套用預設成本",
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
  const defaultCostText = formatCostValues(DEFAULT_COST_VALUES_BY_GAME[gameType]);

  if (noticeText) {
    contents.push({
      type: "text",
      text: noticeText,
      size: "sm",
      color: noticeText.startsWith("成本格式不正確") ? "#D93025" : "#06C755",
      wrap: true,
    });
  }

  contents.push(
    {
      type: "text",
      text: `請輸入 ${friendName} 的成本`,
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
      text: "四個數字請用逗號串接，依序代表二星、三星、四星、車組成本。",
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
          altText: `請輸入「${gameType}」成本`,
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
