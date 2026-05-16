const COMMANDS = {
  SELECT_FRIEND: "選朋友",
  ADD_FRIEND: "新增朋友",
  DELETE_FRIEND: "刪除朋友",
  TODAY_REPORT: "今日報表",
  HELP: "說明",
  UNAVAILABLE: "備用功能無法使用",
};

const INTERNAL_COMMANDS = {
  SELECT_FRIEND_PREFIX: "#",
  DELETE_FRIEND_PREFIX: "!刪除朋友:",
};

const PENDING_ACTIONS = {
  ADD_FRIEND: "add_friend",
};

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

  await handleSaveTextMessage(event, env, userId, text, session);
}

async function handleInternalTextCommand(event, env, userId, text, session) {
  if (text.startsWith(INTERNAL_COMMANDS.DELETE_FRIEND_PREFIX)) {
    const friendName = text
      .slice(INTERNAL_COMMANDS.DELETE_FRIEND_PREFIX.length)
      .trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleDeleteFriend(event, env, friendName);
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
  if (text === COMMANDS.SELECT_FRIEND) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleSelectFriendCommand(event, env);
    return true;
  }

  if (text === COMMANDS.DELETE_FRIEND) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleDeleteFriendCommand(event, env);
    return true;
  }

  if (text === COMMANDS.TODAY_REPORT) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleTodayReportCommand(event, env, userId);
    return true;
  }

  if (text === COMMANDS.UNAVAILABLE) {
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleUnavailableCommand(event, env);
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
    `目前來源已設定為：${friend.name}`,
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

async function handleTodayReportCommand(event, env, userId) {
  const session = await getCurrentSession(env.DB, userId);

  if (!session?.friend_id) {
    await replyMessage(
      event.replyToken,
      "請先點「選朋友」設定目前來源。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const messages = await getTodayMessagesByFriend(env.DB, session.friend_id);

  if (messages.length === 0) {
    await replyMessage(
      event.replyToken,
      `${session.friend_name} 今天還沒有資料。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const report = buildSimpleReport(session.friend_name, messages, "今日報表");

  await replyMessage(event.replyToken, report, env.LINE_CHANNEL_ACCESS_TOKEN);
}

async function handleUnavailableCommand(event, env) {
  await replyMessage(
    event.replyToken,
    "備用功能目前無法使用。",
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleHelpCommand(event, env) {
  await replyMessage(
    event.replyToken,
    [
      "使用方式：",
      "1. 點下方選單的「選朋友」",
      "2. 設定目前來源",
      "3. 傳入這個來源的文字或圖片",
      "4. 點「今日報表」產生目前來源今天的內容",
      "",
      "新增朋友：",
      "點「新增朋友」後，可連續輸入多位朋友名稱。",
      "新增朋友只會加入名單，不會改變目前來源，也不會建立朋友之間的關聯。",
      "",
      "刪除朋友：",
      "點「刪除朋友」後，選擇要刪除的朋友。",
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

  await saveRawMessage(env.DB, {
    friendId: session.friend_id,
    lineUserId: userId,
    messageType: "text",
    rawText: text,
    imageMessageId: null,
  });

  await replyMessage(
    event.replyToken,
    `已記錄到目前來源 ${session.friend_name}：${text}`,
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

  await saveRawMessage(env.DB, {
    friendId: session.friend_id,
    lineUserId: userId,
    messageType: "image",
    rawText: null,
    imageMessageId: event.message.id,
  });

  await replyMessage(
    event.replyToken,
    `已收到圖片，並記錄到目前來源 ${session.friend_name}。圖片解析下一步啟用。`,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function ensureDatabaseSchema(db) {
  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
      `
    )
    .run();

  await ensureColumn(db, "friends", "deleted_at", "TEXT");

  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS user_sessions (
        line_user_id TEXT PRIMARY KEY,
        current_friend_id INTEGER,
        pending_action TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (current_friend_id) REFERENCES friends(id)
      )
      `
    )
    .run();

  await ensureColumn(db, "user_sessions", "pending_action", "TEXT");

  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS raw_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        friend_id INTEGER,
        line_user_id TEXT NOT NULL,
        message_type TEXT NOT NULL,
        raw_text TEXT,
        image_message_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (friend_id) REFERENCES friends(id)
      )
      `
    )
    .run();
}

async function ensureColumn(db, tableName, columnName, columnDefinition) {
  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  const columns = result.results || [];
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    await db
      .prepare(
        `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`
      )
      .run();
  }
}

async function getFriends(db) {
  const result = await db
    .prepare(
      `
      SELECT id, name
      FROM friends
      WHERE deleted_at IS NULL
      ORDER BY id ASC
      `
    )
    .all();

  return result.results || [];
}

async function getFriendByName(db, name) {
  return await db
    .prepare(
      `
      SELECT id, name
      FROM friends
      WHERE name = ?
        AND deleted_at IS NULL
      `
    )
    .bind(name)
    .first();
}

async function createFriend(db, name) {
  const deletedFriend = await getDeletedFriendByName(db, name);
  if (deletedFriend) {
    await db
      .prepare(
        `
        UPDATE friends
        SET deleted_at = NULL
        WHERE id = ?
        `
      )
      .bind(deletedFriend.id)
      .run();

    return await getFriendByName(db, name);
  }

  await db
    .prepare("INSERT OR IGNORE INTO friends (name) VALUES (?)")
    .bind(name)
    .run();

  return await getFriendByName(db, name);
}

async function getDeletedFriendByName(db, name) {
  return await db
    .prepare(
      `
      SELECT id, name
      FROM friends
      WHERE name = ?
        AND deleted_at IS NOT NULL
      `
    )
    .bind(name)
    .first();
}

async function deleteFriend(db, friendId) {
  await db
    .prepare(
      `
      UPDATE user_sessions
      SET current_friend_id = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE current_friend_id = ?
      `
    )
    .bind(friendId)
    .run();

  await db
    .prepare(
      `
      UPDATE friends
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND deleted_at IS NULL
      `
    )
    .bind(friendId)
    .run();
}

async function setCurrentFriend(db, lineUserId, friendId) {
  await db
    .prepare(
      `
      INSERT INTO user_sessions (
        line_user_id,
        current_friend_id,
        pending_action,
        updated_at
      )
      VALUES (?, ?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(line_user_id)
      DO UPDATE SET
        current_friend_id = excluded.current_friend_id,
        pending_action = NULL,
        updated_at = CURRENT_TIMESTAMP
      `
    )
    .bind(lineUserId, friendId)
    .run();
}

async function setPendingAction(db, lineUserId, pendingAction) {
  await db
    .prepare(
      `
      INSERT INTO user_sessions (line_user_id, pending_action, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(line_user_id)
      DO UPDATE SET
        pending_action = excluded.pending_action,
        updated_at = CURRENT_TIMESTAMP
      `
    )
    .bind(lineUserId, pendingAction)
    .run();
}

async function clearPendingAction(db, lineUserId) {
  await db
    .prepare(
      `
      UPDATE user_sessions
      SET pending_action = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE line_user_id = ?
      `
    )
    .bind(lineUserId)
    .run();
}

async function getCurrentSession(db, lineUserId) {
  return await db
    .prepare(
      `
      SELECT
        friends.id AS friend_id,
        user_sessions.pending_action AS pending_action,
        friends.name AS friend_name
      FROM user_sessions
      LEFT JOIN friends
        ON friends.id = user_sessions.current_friend_id
       AND friends.deleted_at IS NULL
      WHERE user_sessions.line_user_id = ?
      `
    )
    .bind(lineUserId)
    .first();
}

async function saveRawMessage(db, message) {
  await db
    .prepare(
      `
      INSERT INTO raw_messages (
        friend_id,
        line_user_id,
        message_type,
        raw_text,
        image_message_id
      )
      VALUES (?, ?, ?, ?, ?)
      `
    )
    .bind(
      message.friendId,
      message.lineUserId,
      message.messageType,
      message.rawText,
      message.imageMessageId
    )
    .run();
}

async function getTodayMessagesByFriend(db, friendId) {
  const result = await db
    .prepare(
      `
      SELECT id, message_type, raw_text, image_message_id, created_at
      FROM raw_messages
      WHERE friend_id = ?
        AND date(created_at, '+8 hours') = date('now', '+8 hours')
      ORDER BY created_at ASC
      LIMIT 50
      `
    )
    .bind(friendId)
    .all();

  return result.results || [];
}

function buildSimpleReport(friendName, messages, reportTitle = "資料整理") {
  const lines = [`${friendName} ${reportTitle}`, ""];

  for (const [index, message] of messages.entries()) {
    if (message.message_type === "text") {
      lines.push(`${index + 1}. ${message.raw_text}`);
    } else if (message.message_type === "image") {
      lines.push(`${index + 1}. [圖片] ${message.image_message_id}`);
    } else {
      lines.push(`${index + 1}. [${message.message_type}]`);
    }
  }

  return lines.join("\n");
}

function isAllowedUser(userId, allowedUserIds) {
  if (!userId || !allowedUserIds) return false;

  return allowedUserIds
    .split(",")
    .map((id) => id.trim())
    .includes(userId);
}

async function replyMessage(replyToken, text, channelAccessToken) {
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
          type: "text",
          text,
        },
      ],
    }),
  });
}

async function replyFriendPicker(replyToken, friends, channelAccessToken) {
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

async function replyDeleteFriendPicker(replyToken, friends, channelAccessToken) {
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
