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
  TODAY_REPORT_PREFIX: "!今日報表:",
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

  if (text.startsWith(INTERNAL_COMMANDS.TODAY_REPORT_PREFIX)) {
    const friendName = text
      .slice(INTERNAL_COMMANDS.TODAY_REPORT_PREFIX.length)
      .trim();
    await clearPendingActionIfNeeded(env.DB, userId, session);
    await handleTodayReportForFriendName(event, env, friendName);
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
    await handleTodayReportCommand(event, env);
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

async function handleTodayReportCommand(event, env) {
  const friends = await getFriends(env.DB);
  await replyTodayReportFriendPicker(
    event.replyToken,
    friends,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleTodayReportForFriendName(event, env, friendName) {
  const friend = await getFriendByName(env.DB, friendName);
  if (!friend) {
    await replyMessage(
      event.replyToken,
      `找不到朋友：${friendName}。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const entries = await getTodayParsedEntriesByFriend(env.DB, friend.id);
  const imageCount = await getTodayImageMessageCountByFriend(env.DB, friend.id);

  if (entries.length === 0 && imageCount === 0) {
    await replyMessage(
      event.replyToken,
      `${friend.name} 今天還沒有資料。`,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const report = buildCalculationReport(friend.name, entries, imageCount);

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

  const rawMessageId = await saveRawMessage(env.DB, {
    friendId: session.friend_id,
    lineUserId: userId,
    messageType: "text",
    rawText: text,
    imageMessageId: null,
  });

  await saveParsedEntriesForText(env.DB, {
    rawMessageId,
    friendId: session.friend_id,
    lineUserId: userId,
    rawText: text,
  });

  await replyMessage(
    event.replyToken,
    `已收到 ${session.friend_name} 的下注內容。`,
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

  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS parsed_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_message_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        line_user_id TEXT NOT NULL,
        source_line_text TEXT NOT NULL,
        number_part TEXT,
        rule_part TEXT,
        rows_json TEXT,
        calculations_json TEXT,
        total_amount REAL NOT NULL DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (raw_message_id) REFERENCES raw_messages(id),
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
  const result = await db
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

  return result.meta?.last_row_id ?? null;
}

async function saveParsedEntriesForText(db, message) {
  if (!message.rawMessageId) return;

  const entries = parseTextToCalculationEntries(message.rawText);

  for (const entry of entries) {
    await db
      .prepare(
        `
        INSERT INTO parsed_entries (
          raw_message_id,
          friend_id,
          line_user_id,
          source_line_text,
          number_part,
          rule_part,
          rows_json,
          calculations_json,
          total_amount,
          error_message
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(
        message.rawMessageId,
        message.friendId,
        message.lineUserId,
        entry.sourceLineText,
        entry.numberPart,
        entry.rulePart,
        JSON.stringify(entry.rows),
        JSON.stringify(entry.calculations),
        entry.totalAmount,
        entry.errorMessage
      )
      .run();
  }
}

async function getTodayParsedEntriesByFriend(db, friendId) {
  const result = await db
    .prepare(
      `
      SELECT
        id,
        source_line_text,
        rows_json,
        calculations_json,
        total_amount,
        error_message,
        created_at
      FROM parsed_entries
      WHERE friend_id = ?
        AND date(created_at, '+8 hours') = date('now', '+8 hours')
      ORDER BY created_at ASC, id ASC
      LIMIT 1000
      `
    )
    .bind(friendId)
    .all();

  return (result.results || []).map(normalizeParsedEntryFromDb);
}

async function getTodayImageMessageCountByFriend(db, friendId) {
  const row = await db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM raw_messages
      WHERE friend_id = ?
        AND message_type = 'image'
        AND date(created_at, '+8 hours') = date('now', '+8 hours')
      `
    )
    .bind(friendId)
    .first();

  return row?.count || 0;
}

function normalizeParsedEntryFromDb(row) {
  return {
    sourceLineText: row.source_line_text,
    rows: parseJsonOrDefault(row.rows_json, []),
    calculations: parseJsonOrDefault(row.calculations_json, []),
    totalAmount: row.total_amount || 0,
    errorMessage: row.error_message,
  };
}

function parseJsonOrDefault(value, defaultValue) {
  try {
    return value ? JSON.parse(value) : defaultValue;
  } catch (error) {
    return defaultValue;
  }
}

function buildCalculationReport(friendName, entries, imageCount = 0) {
  const totals = { 2: 0, 3: 0, 4: 0 };
  const lines = [`${friendName} 今日報表`, ""];

  if (entries.length === 0) {
    lines.push("今天沒有可計算的文字資料。");
  }

  for (const [index, entry] of entries.entries()) {
    lines.push(`${index + 1}. ${entry.sourceLineText}`);

    if (entry.errorMessage) {
      lines.push(`   無法解析：${entry.errorMessage}`);
      continue;
    }

    lines.push(`   排數：${entry.rows.length}`);

    const calculationTexts = entry.calculations.map((calculation) => {
      if (totals[calculation.pick] !== undefined) {
        totals[calculation.pick] += calculation.amount;
      }

      return `${formatPickLabel(calculation.pick)}=${formatNumber(
        calculation.amount
      )}`;
    });

    lines.push(`   ${calculationTexts.join("，")}`);
  }

  lines.push("");
  lines.push("加總");
  lines.push(`二：${formatNumber(totals[2])}`);
  lines.push(`三：${formatNumber(totals[3])}`);
  lines.push(`四：${formatNumber(totals[4])}`);

  if (imageCount > 0) {
    lines.push("");
    lines.push(`圖片 ${imageCount} 筆尚未解析。`);
  }

  return lines.join("\n");
}

function parseTextToCalculationEntries(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCalculationLine);
}

function parseCalculationLine(line) {
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

    const rows = parseNumberRows(numberPart);
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

function parseNumberRows(numberPart) {
  const normalized = String(numberPart)
    .trim()
    .replace(/[×＊*]/g, "x")
    .replace(/X/g, "x");

  const hasRowSeparator = /[x.]/.test(normalized);
  const rowTexts = hasRowSeparator
    ? normalized.split(/[x.]+/).filter(Boolean)
    : splitIntoTwoDigitNumbers(normalized);

  const rows = rowTexts.map((rowText) => splitIntoTwoDigitNumbers(rowText));

  if (rows.length === 0 || rows.some((row) => row.length === 0)) {
    throw new Error("號碼區沒有可用號碼");
  }

  return rows;
}

function splitIntoTwoDigitNumbers(value) {
  const digits = String(value).replace(/\D/g, "");

  if (!digits) return [];

  if (digits.length % 2 !== 0) {
    throw new Error(`號碼區位數不是偶數：${value}`);
  }

  const numbers = [];
  for (let index = 0; index < digits.length; index += 2) {
    numbers.push(digits.slice(index, index + 2));
  }

  return numbers;
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

function formatPickLabel(pick) {
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
  };

  return labels[pick] || String(pick);
}

function formatNumber(value) {
  return Number(value.toFixed(4)).toString();
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

async function replyTodayReportFriendPicker(replyToken, friends, channelAccessToken) {
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
    color: "#1A73E8",
    action: {
      type: "message",
      label: friend.name,
      text: `${INTERNAL_COMMANDS.TODAY_REPORT_PREFIX}${friend.name}`,
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
          altText: "請選擇今日報表朋友",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              spacing: "md",
              contents: [
                {
                  type: "text",
                  text: "請選擇今日報表朋友",
                  weight: "bold",
                  size: "lg",
                },
                {
                  type: "text",
                  text: "會統整這位朋友今天已記錄的二、三、四支數。",
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
