import { COMMANDS, COST_GAME_TYPES, DEFAULT_COST_ROWS, INTERNAL_COMMANDS, PENDING_ACTIONS } from './constants.js';
import {
  buildNormalizedOrderText,
  hasOpenAIConfig,
  parseOrderImageWithAI,
  parseOrderTextWithAI,
} from './aiParser.js';
import { buildEditCostPendingAction, parseCostCsvLine, parseEditCostPendingAction } from './costs.js';
import { downloadLineImage } from './lineContent.js';
import { buildCalculationReport, buildCostReport } from './reports.js';
import { getTaipeiDateString, isAllowedUser, isValidDateText, parseDateFriendPayload } from './utils.js';
import {
  clearPendingAction,
  createFriend,
  deleteFriend,
  ensureDatabaseSchema,
  getCurrentSession,
  getFriendById,
  getFriendByName,
  getFriendCosts,
  getFriends,
  getFriendsWithOrdersByDate,
  getImageMessageCountByFriendAndDate,
  getOrCreateFriendCosts,
  getParsedEntriesByFriendAndDate,
  saveFriendCosts,
  saveAIParseResult,
  saveParsedEntriesForText,
  saveRawMessage,
  setCurrentFriend,
  setPendingAction,
} from './db.js';
import {
  replyCostActionMenu,
  replyCostEditModeMenu,
  replyCostInputPrompt,
  replyCostManagementFriendPicker,
  replyDeleteFriendConfirmation,
  replyDeleteFriendPicker,
  replyFriendManagementMenu,
  replyFriendPicker,
  replyMessage,
  replyOrderReportFriendPicker,
  replyPastOrdersMenu,
} from './lineReplies.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("LINE helper is running");
    }

    if (url.pathname === "/line/webhook" && request.method === "POST") {
      const body = await request.json();

      await ensureDatabaseSchema(env.DB);

      for (const event of body.events || []) {
        const userId = event.source?.userId;

        if (!isAllowedUser(userId, env.ALLOWED_USER_IDS)) {
          if (event.replyToken) {
            await replyMessage(
              event.replyToken,
              "尚未授權使用這個服務。",
              env.LINE_CHANNEL_ACCESS_TOKEN
            );
          }
          continue;
        }

        if (event.type !== "message") {
          continue;
        }

        if (event.message.type === "text") {
          await handleTextMessage(event, env, userId);
          continue;
        }

        if (event.message.type === "image") {
          await handleImageMessage(event, env, userId);
          continue;
        }

        await replyMessage(
          event.replyToken,
          `收到 ${event.message.type} 類型訊息，目前尚未支援。`,
          env.LINE_CHANNEL_ACCESS_TOKEN
        );
      }

      return new Response("OK");
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleTextMessage(event, env, userId) {
  const text = event.message.text.trim();

  if (text === COMMANDS.ADD_FRIEND) {
    await handleAddFriendCommand(event, env, userId);
    return;
  }

  const session = await getCurrentSession(env.DB, userId);

  if (await handleInternalTextCommand(event, env, userId, text, session)) {
    return;
  }

  if (await handleRichMenuCommand(event, env, userId, text, session)) {
    return;
  }

  if (session?.pending_action === PENDING_ACTIONS.ADD_FRIEND) {
    await handlePendingAddFriend(event, env, userId, text);
    return;
  }

  if (session?.pending_action === PENDING_ACTIONS.PAST_ORDER_DATE) {
    await handlePendingPastOrderDate(event, env, userId, text);
    return;
  }

  if (session?.pending_action?.startsWith(PENDING_ACTIONS.EDIT_COST_PREFIX)) {
    await handlePendingEditCost(event, env, userId, text, session);
    return;
  }

  await handleSaveTextMessage(event, env, userId, text, session);
}

async function handleInternalTextCommand(event, env, userId, text, session) {
  if (text.startsWith(INTERNAL_COMMANDS.CONFIRM_DELETE_FRIEND_PREFIX)) {
    const friendName = text
      .slice(INTERNAL_COMMANDS.CONFIRM_DELETE_FRIEND_PREFIX.length)
      .trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleConfirmDeleteFriend(event, env, friendName);
    return true;
  }

  if (text === INTERNAL_COMMANDS.CANCEL_DELETE_FRIEND) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await replyMessage(
      event.replyToken,
      "已取消刪除朋友。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return true;
  }

  if (text.startsWith(INTERNAL_COMMANDS.DELETE_FRIEND_PREFIX)) {
    const friendName = text
      .slice(INTERNAL_COMMANDS.DELETE_FRIEND_PREFIX.length)
      .trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleDeleteFriend(event, env, friendName);
    return true;
  }

  if (text.startsWith(INTERNAL_COMMANDS.ORDER_REPORT_PREFIX)) {
    const payload = text.slice(INTERNAL_COMMANDS.ORDER_REPORT_PREFIX.length);
    const { dateText, friendName } = parseDateFriendPayload(payload);
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleOrderReportForFriendName(event, env, dateText, friendName);
    return true;
  }

  if (text.startsWith(INTERNAL_COMMANDS.PAST_ORDER_DATE_PREFIX)) {
    const dateText = text
      .slice(INTERNAL_COMMANDS.PAST_ORDER_DATE_PREFIX.length)
      .trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handlePastOrderDateSelected(event, env, dateText);
    return true;
  }

  if (text.startsWith(INTERNAL_COMMANDS.COST_MANAGEMENT_PREFIX)) {
    const friendName = text
      .slice(INTERNAL_COMMANDS.COST_MANAGEMENT_PREFIX.length)
      .trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleCostManagementForFriendName(event, env, friendName);
    return true;
  }

  if (text.startsWith(INTERNAL_COMMANDS.VIEW_COST_PREFIX)) {
    const friendName = text.slice(INTERNAL_COMMANDS.VIEW_COST_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleViewCost(event, env, friendName);
    return true;
  }

  if (text.startsWith(INTERNAL_COMMANDS.EDIT_COST_PREFIX)) {
    const friendName = text.slice(INTERNAL_COMMANDS.EDIT_COST_PREFIX.length).trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleEditCost(event, env, friendName);
    return true;
  }

  if (text.startsWith(INTERNAL_COMMANDS.APPLY_DEFAULT_COST_PREFIX)) {
    const friendName = text
      .slice(INTERNAL_COMMANDS.APPLY_DEFAULT_COST_PREFIX.length)
      .trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleApplyDefaultCost(event, env, friendName);
    return true;
  }

  if (text.startsWith(INTERNAL_COMMANDS.MANUAL_EDIT_COST_PREFIX)) {
    const friendName = text
      .slice(INTERNAL_COMMANDS.MANUAL_EDIT_COST_PREFIX.length)
      .trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleManualEditCost(event, env, friendName);
    return true;
  }

  if (text.startsWith(INTERNAL_COMMANDS.SELECT_FRIEND_PREFIX)) {
    const friendName = text
      .slice(INTERNAL_COMMANDS.SELECT_FRIEND_PREFIX.length)
      .trim();
    await handleSelectFriendByName(event, env, userId, friendName);
    return true;
  }

  return false;
}

async function handleRichMenuCommand(event, env, userId, text, session) {
  if (text === COMMANDS.SELECT_FRIEND_FOR_BET) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleSelectFriendCommand(event, env);
    return true;
  }

  if (text === COMMANDS.TODAY_ORDERS) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleOrderReportDateCommand(event, env, getTaipeiDateString());
    return true;
  }

  if (text === COMMANDS.PAST_ORDERS) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handlePastOrdersCommand(event, env);
    return true;
  }

  if (text === COMMANDS.FRIEND_MANAGEMENT) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleFriendManagementCommand(event, env);
    return true;
  }

  if (text === COMMANDS.DELETE_FRIEND) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleDeleteFriendCommand(event, env);
    return true;
  }

  if (text === COMMANDS.FRIEND_LIST) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleFriendListCommand(event, env);
    return true;
  }

  if (text === COMMANDS.COST_MANAGEMENT) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleCostManagementCommand(event, env);
    return true;
  }

  if (text === COMMANDS.HELP) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleHelpCommand(event, env);
    return true;
  }

  return false;
}

async function handleAddFriendCommand(event, env, userId) {
  await setPendingAction(env.DB, userId, PENDING_ACTIONS.ADD_FRIEND);

  await replyMessage(
    event.replyToken,
    "請輸入朋友名稱。可連續輸入多位朋友，不會影響目前來源。",
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleSelectFriendCommand(event, env) {
  const friends = await getFriends(env.DB);
  await replyFriendPicker(
    event.replyToken,
    friends,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleSelectFriendByName(event, env, userId, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。請先新增朋友。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  await setCurrentFriend(env.DB, userId, friend.id);

  await replyMessage(
    event.replyToken,
    `目前下單朋友已設定為：${friend.name}`,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleFriendManagementCommand(event, env) {
  await replyFriendManagementMenu(
    event.replyToken,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleDeleteFriendCommand(event, env) {
  const friends = await getFriends(env.DB);
  await replyDeleteFriendPicker(
    event.replyToken,
    friends,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleFriendListCommand(event, env) {
  const friends = await getFriends(env.DB);

  if (friends.length === 0) {
    await replyMessage(
      event.replyToken,
      "目前沒有朋友名單。請先新增朋友。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const lines = ["朋友列表", ""];
  for (const [index, friend] of friends.entries()) {
    lines.push(`${index + 1}. ${friend.name}`);
  }

  await replyMessage(
    event.replyToken,
    lines.join("\n"),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleOrderReportDateCommand(event, env, dateText) {
  const friends = await getFriendsWithOrdersByDate(env.DB, dateText);
  await replyOrderReportFriendPicker(
    event.replyToken,
    friends,
    dateText,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handlePastOrdersCommand(event, env) {
  await replyPastOrdersMenu(event.replyToken, env.LINE_CHANNEL_ACCESS_TOKEN);
}

async function handlePastOrderDateSelected(event, env, dateText) {
  if (dateText === "指定日期") {
    await setPendingAction(env.DB, event.source.userId, PENDING_ACTIONS.PAST_ORDER_DATE);
    await replyMessage(
      event.replyToken,
      "請輸入日期，格式 yyyy-MM-dd，例如 2026-05-16。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  await handleOrderReportDateCommand(event, env, dateText);
}

async function handlePendingPastOrderDate(event, env, userId, text) {
  const dateText = text.trim();
  if (!isValidDateText(dateText)) {
    await replyMessage(
      event.replyToken,
      "日期格式不正確，請輸入 yyyy-MM-dd，例如 2026-05-16。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  await clearPendingAction(env.DB, userId);
  await handleOrderReportDateCommand(event, env, dateText);
}

async function handleOrderReportForFriendName(event, env, dateText, friendName) {
  if (!isValidDateText(dateText)) {
    await replyMessage(
      event.replyToken,
      "日期格式不正確。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const entries = await getParsedEntriesByFriendAndDate(env.DB, friend.id, dateText);
  const imageCount = await getImageMessageCountByFriendAndDate(
    env.DB,
    friend.id,
    dateText
  );

  if (entries.length === 0 && imageCount === 0) {
    await replyMessage(
      event.replyToken,
      `${friend.name} ${dateText} 沒有注單資料。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const report = buildCalculationReport(friend.name, entries, imageCount, dateText);

  await replyMessage(event.replyToken, report, env.LINE_CHANNEL_ACCESS_TOKEN);
}

async function handleCostManagementCommand(event, env) {
  const friends = await getFriends(env.DB);
  await replyCostManagementFriendPicker(
    event.replyToken,
    friends,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleCostManagementForFriendName(event, env, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  await replyCostActionMenu(
    event.replyToken,
    friend,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleViewCost(event, env, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const { costs, usedDefaultCosts } = await getOrCreateFriendCosts(
    env.DB,
    friend.id
  );
  const message = usedDefaultCosts
    ? [
        `${friend.name} 尚未設定成本，已自動套用預設成本。`,
        "",
        buildCostReport(friend.name, costs),
      ].join("\n")
    : buildCostReport(friend.name, costs);

  await replyMessage(
    event.replyToken,
    message,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleEditCost(event, env, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  await replyCostEditModeMenu(
    event.replyToken,
    friend,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleApplyDefaultCost(event, env, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  await saveFriendCosts(env.DB, friend.id, DEFAULT_COST_ROWS);
  const costs = await getFriendCosts(env.DB, friend.id);

  await replyMessage(
    event.replyToken,
    [`已套用 ${friend.name} 的預設成本。`, "", buildCostReport(friend.name, costs)].join(
      "\n"
    ),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleManualEditCost(event, env, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  await setPendingAction(
    env.DB,
    event.source.userId,
    buildEditCostPendingAction(friend.id, 0, [])
  );

  await replyCostInputPrompt(
    event.replyToken,
    friend.name,
    COST_GAME_TYPES[0],
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handlePendingEditCost(event, env, userId, text, session) {
  const state = parseEditCostPendingAction(session.pending_action);
  const friendId = state.friendId;
  const friend = await getFriendById(env.DB, friendId);

  if (!friend) {
    await clearPendingAction(env.DB, userId);
    await replyMessage(
      event.replyToken,
      "找不到要編輯成本的朋友，已取消編輯模式。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  let costRow;
  const gameType = COST_GAME_TYPES[state.gameIndex];
  try {
    costRow = parseCostCsvLine(gameType, text);
  } catch (error) {
    await replyCostInputPrompt(
      event.replyToken,
      friend.name,
      gameType,
      env.LINE_CHANNEL_ACCESS_TOKEN,
      `成本格式不正確：${error.message}`
    );
    return;
  }

  const costRows = [...state.costRows, costRow];
  const nextGameIndex = state.gameIndex + 1;

  if (nextGameIndex < COST_GAME_TYPES.length) {
    await setPendingAction(
      env.DB,
      userId,
      buildEditCostPendingAction(friend.id, nextGameIndex, costRows)
    );

    await replyCostInputPrompt(
      event.replyToken,
      friend.name,
      COST_GAME_TYPES[nextGameIndex],
      env.LINE_CHANNEL_ACCESS_TOKEN,
      `已暫存「${gameType}」成本。`
    );
    return;
  }

  await saveFriendCosts(env.DB, friend.id, costRows);
  await clearPendingAction(env.DB, userId);

  const costs = await getFriendCosts(env.DB, friend.id);
  await replyMessage(
    event.replyToken,
    [`已更新 ${friend.name} 的成本設定。`, "", buildCostReport(friend.name, costs)].join(
      "\n"
    ),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleHelpCommand(event, env) {
  await replyMessage(
    event.replyToken,
    [
      "使用方式：",
      "1. 點「選朋友下單」",
      "2. 選擇要記錄注單的朋友",
      "3. 傳入這位朋友的文字或圖片注單",
      "4. 點「今日注單」查看今天的注單與支數統計",
      "",
      "過往注單：",
      "可選昨天、前天或輸入特定日期，再選朋友查看。",
      "",
      "朋友管理：",
      "可新增朋友或刪除朋友。",
      "新增朋友只會加入名單，不會改變目前來源，也不會建立朋友之間的關聯。",
      "刪除朋友會先要求二次確認，並只做軟刪。",
    ].join("\n"),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleSaveTextMessage(event, env, userId, text, session) {
  if (!session?.friend_id) {
    await replyMessage(
      event.replyToken,
      "請先點「選朋友」設定目前來源，再傳入資料。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const rawMessageId = await saveRawMessage(env.DB, {
    friendId: session.friend_id,
    lineUserId: userId,
    messageType: "text",
    rawText: text,
    imageMessageId: null,
  });

  const parseResult = await parseAndSaveOrderText(env, {
    rawMessageId,
    friendId: session.friend_id,
    lineUserId: userId,
    inputType: "text",
    rawText: text,
  });

  await replyMessage(
    event.replyToken,
    buildOrderReceivedMessage(session.friend_name, parseResult),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function clearPendingActionIfNeeded(db, userId, session) {
  if (session?.pending_action) {
    await clearPendingAction(db, userId);
  }
}

async function handlePendingAddFriend(event, env, userId, text) {
  const friendName = text.trim();

  if (!friendName) {
    await replyMessage(
      event.replyToken,
      "朋友名稱不能是空白，請重新輸入朋友名稱。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const existingFriend = await getFriendByName(env.DB, friendName);
  if (existingFriend) {
    await replyMessage(
      event.replyToken,
      [
        `朋友已存在：${existingFriend.name}`,
        "可繼續輸入下一位朋友名稱，不會影響目前來源。",
      ].join("\n"),
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const friend = await createFriend(env.DB, friendName);

  await replyMessage(
    event.replyToken,
    [
      `已新增朋友：${friend.name}`,
      "可繼續輸入下一位朋友名稱，不會影響目前來源。",
    ].join("\n"),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleDeleteFriend(event, env, friendName) {
  if (!friendName) {
    await replyMessage(
      event.replyToken,
      "請先選擇要刪除的朋友。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  await replyDeleteFriendConfirmation(
    event.replyToken,
    friend,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleConfirmDeleteFriend(event, env, friendName) {
  if (!friendName) {
    await replyMessage(
      event.replyToken,
      "請先選擇要刪除的朋友。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  await deleteFriend(env.DB, friend.id);

  await replyMessage(
    event.replyToken,
    `已刪除朋友：${friend.name}`,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleImageMessage(event, env, userId) {
  const session = await getCurrentSession(env.DB, userId);

  if (session?.pending_action === PENDING_ACTIONS.ADD_FRIEND) {
    await replyMessage(
      event.replyToken,
      "請輸入文字作為朋友名稱，不要傳圖片。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  await handleSaveImageMessage(event, env, userId, session);
}

async function handleSaveImageMessage(event, env, userId, session) {
  if (!session?.friend_id) {
    await replyMessage(
      event.replyToken,
      "請先點「選朋友」設定目前來源，再傳入圖片。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const rawMessageId = await saveRawMessage(env.DB, {
    friendId: session.friend_id,
    lineUserId: userId,
    messageType: "image",
    rawText: null,
    imageMessageId: event.message.id,
  });

  if (!hasOpenAIConfig(env)) {
    await replyMessage(
      event.replyToken,
      [
        `已收到 ${session.friend_name} 的圖片注單。`,
        "目前尚未設定 OPENAI_API_KEY，圖片已先保存，但尚未解析。",
      ].join("\n"),
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const parseResult = await parseAndSaveOrderImage(env, {
    rawMessageId,
    friendId: session.friend_id,
    lineUserId: userId,
    messageId: event.message.id,
  });

  await replyMessage(
    event.replyToken,
    buildOrderReceivedMessage(session.friend_name, parseResult),
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function parseAndSaveOrderText(env, message) {
  if (!hasOpenAIConfig(env)) {
    const entries = await saveParsedEntriesForText(env.DB, message);
    return {
      status: "fallback",
      parsedCount: countSuccessfulEntries(entries),
      errorCount: countFailedEntries(entries),
      warnings: ["尚未設定 OPENAI_API_KEY，已用原始文字直接解析。"],
    };
  }

  try {
    const aiResult = await parseOrderTextWithAI(env, message.rawText);
    return await saveAIParseResultAndEntries(env, message, aiResult);
  } catch (error) {
    await saveAIParseResult(env.DB, {
      rawMessageId: message.rawMessageId,
      friendId: message.friendId,
      lineUserId: message.lineUserId,
      inputType: message.inputType,
      aiOutputJson: null,
      normalizedText: null,
      status: "error",
      errorMessage: error.message,
    });

    const entries = await saveParsedEntriesForText(env.DB, message);
    return {
      status: "fallback",
      parsedCount: countSuccessfulEntries(entries),
      errorCount: countFailedEntries(entries),
      warnings: [`AI 解析失敗，已改用原始文字直接解析：${error.message}`],
    };
  }
}

async function parseAndSaveOrderImage(env, message) {
  try {
    const image = await downloadLineImage(env, message.messageId);
    const aiResult = await parseOrderImageWithAI(env, image);
    return await saveAIParseResultAndEntries(env, {
      ...message,
      inputType: "image",
    }, aiResult);
  } catch (error) {
    await saveAIParseResult(env.DB, {
      rawMessageId: message.rawMessageId,
      friendId: message.friendId,
      lineUserId: message.lineUserId,
      inputType: "image",
      aiOutputJson: null,
      normalizedText: null,
      status: "error",
      errorMessage: error.message,
    });

    return {
      status: "error",
      parsedCount: 0,
      errorCount: 0,
      warnings: [`圖片已保存，但 AI 解析失敗：${error.message}`],
    };
  }
}

async function saveAIParseResultAndEntries(env, message, aiResult) {
  const normalizedText = buildNormalizedOrderText(aiResult);
  const status = normalizedText ? "success" : "empty";

  await saveAIParseResult(env.DB, {
    rawMessageId: message.rawMessageId,
    friendId: message.friendId,
    lineUserId: message.lineUserId,
    inputType: message.inputType,
    aiOutputJson: JSON.stringify(aiResult),
    normalizedText,
    status,
    errorMessage: null,
  });

  if (!normalizedText) {
    return {
      status,
      parsedCount: 0,
      errorCount: 0,
      warnings: aiResult.warnings,
    };
  }

  const entries = await saveParsedEntriesForText(env.DB, {
    rawMessageId: message.rawMessageId,
    friendId: message.friendId,
    lineUserId: message.lineUserId,
    rawText: normalizedText,
  });

  return {
    status,
    parsedCount: countSuccessfulEntries(entries),
    errorCount: countFailedEntries(entries),
    warnings: aiResult.warnings,
  };
}

function buildOrderReceivedMessage(friendName, parseResult) {
  const lines = [`已收到 ${friendName} 的下注內容。`];

  if (parseResult.parsedCount > 0) {
    lines.push(`成功解析 ${parseResult.parsedCount} 行。`);
  }

  if (parseResult.errorCount > 0) {
    lines.push(`有 ${parseResult.errorCount} 行格式仍需確認。`);
  }

  if (parseResult.parsedCount === 0 && parseResult.errorCount === 0) {
    lines.push("目前沒有可計算的注單行。");
  }

  if (parseResult.warnings?.length > 0) {
    lines.push("");
    lines.push("提醒：");
    lines.push(...parseResult.warnings.slice(0, 5));
  }

  return lines.join("\n");
}

function countSuccessfulEntries(entries = []) {
  return entries.filter((entry) => !entry.errorMessage).length;
}

function countFailedEntries(entries = []) {
  return entries.filter((entry) => entry.errorMessage).length;
}
