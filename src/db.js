import { DEFAULT_COST_ROWS } from './constants.js';
import { parseTextToCalculationEntries } from './calculations.js';
import { getTaipeiDateString } from './utils.js';

export async function ensureDatabaseSchema(db) {
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
        current_game_type TEXT,
        pending_action TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (current_friend_id) REFERENCES friends(id)
      )
      `
    )
    .run();

  await ensureColumn(db, "user_sessions", "pending_action", "TEXT");
  await ensureColumn(db, "user_sessions", "current_game_type", "TEXT");

  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS raw_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        friend_id INTEGER,
        line_user_id TEXT NOT NULL,
        message_type TEXT NOT NULL,
        game_type TEXT,
        raw_text TEXT,
        image_message_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (friend_id) REFERENCES friends(id)
      )
      `
    )
    .run();
  await ensureColumn(db, "raw_messages", "game_type", "TEXT");

  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS parsed_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_message_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        line_user_id TEXT NOT NULL,
        game_type TEXT,
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
  await ensureColumn(db, "parsed_entries", "game_type", "TEXT");

  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS friend_costs (
        friend_id INTEGER NOT NULL,
        game_type TEXT NOT NULL,
        star2_cost REAL NOT NULL DEFAULT 0,
        star3_cost REAL NOT NULL DEFAULT 0,
        star4_cost REAL NOT NULL DEFAULT 0,
        car_cost REAL NOT NULL DEFAULT 0,
        star2_prize REAL NOT NULL DEFAULT 0,
        star3_prize REAL NOT NULL DEFAULT 0,
        star4_prize REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (friend_id, game_type),
        FOREIGN KEY (friend_id) REFERENCES friends(id)
      )
      `
    )
    .run();
  await ensureColumn(db, "friend_costs", "star2_prize", "REAL NOT NULL DEFAULT 0");
  await ensureColumn(db, "friend_costs", "star3_prize", "REAL NOT NULL DEFAULT 0");
  await ensureColumn(db, "friend_costs", "star4_prize", "REAL NOT NULL DEFAULT 0");

  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS ai_parse_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_message_id INTEGER NOT NULL,
        friend_id INTEGER NOT NULL,
        line_user_id TEXT NOT NULL,
        input_type TEXT NOT NULL,
        ai_output_json TEXT,
        normalized_text TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (raw_message_id) REFERENCES raw_messages(id),
        FOREIGN KEY (friend_id) REFERENCES friends(id)
      )
      `
    )
    .run();

  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS raw_message_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_message_id INTEGER NOT NULL,
        old_raw_text TEXT,
        new_raw_text TEXT NOT NULL,
        line_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (raw_message_id) REFERENCES raw_messages(id)
      )
      `
    )
    .run();

  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS winning_numbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_type TEXT NOT NULL,
        draw_date TEXT NOT NULL,
        numbers_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(game_type, draw_date)
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

export async function getFriends(db) {
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

export async function getFriendByName(db, name) {
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

export async function getFriendById(db, id) {
  return await db
    .prepare(
      `
      SELECT id, name
      FROM friends
      WHERE id = ?
        AND deleted_at IS NULL
      `
    )
    .bind(id)
    .first();
}

export async function createFriend(db, name) {
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

export async function deleteFriend(db, friendId) {
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

export async function getFriendCosts(db, friendId) {
  const result = await db
    .prepare(
      `
      SELECT
        game_type,
        star2_cost,
        star3_cost,
        star4_cost,
        car_cost,
        star2_prize,
        star3_prize,
        star4_prize,
        updated_at
      FROM friend_costs
      WHERE friend_id = ?
      ORDER BY
        CASE game_type
          WHEN '539' THEN 1
          WHEN '大樂透' THEN 2
          WHEN '港號' THEN 3
          ELSE 4
        END
      `
    )
    .bind(friendId)
    .all();

  return result.results || [];
}

export async function getOrCreateFriendCosts(db, friendId) {
  let costs = await getFriendCosts(db, friendId);

  if (costs.length > 0) {
    const changed = await ensureFriendCostsComplete(db, friendId, costs);
    costs = changed ? await getFriendCosts(db, friendId) : costs;

    return { costs, usedDefaultCosts: false };
  }

  await saveFriendCosts(db, friendId, DEFAULT_COST_ROWS);
  costs = await getFriendCosts(db, friendId);

  return { costs, usedDefaultCosts: true };
}

async function ensureFriendCostsComplete(db, friendId, costs) {
  let changed = false;
  const existingGameTypes = new Set(costs.map((cost) => cost.game_type));

  for (const defaultRow of DEFAULT_COST_ROWS) {
    if (!existingGameTypes.has(defaultRow.gameType)) {
      await saveFriendCosts(db, friendId, [defaultRow]);
      changed = true;
    }
  }

  for (const cost of costs) {
    const defaultRow = DEFAULT_COST_ROWS.find(
      (row) => row.gameType === cost.game_type
    );
    if (
      defaultRow &&
      Number(cost.star2_prize) === 0 &&
      Number(cost.star3_prize) === 0 &&
      Number(cost.star4_prize) === 0
    ) {
      await db
        .prepare(
          `
          UPDATE friend_costs
          SET star2_prize = ?,
              star3_prize = ?,
              star4_prize = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE friend_id = ?
            AND game_type = ?
          `
        )
        .bind(
          defaultRow.star2Prize,
          defaultRow.star3Prize,
          defaultRow.star4Prize,
          friendId,
          cost.game_type
        )
        .run();
      changed = true;
    }
  }

  return changed;
}

export async function saveFriendCosts(db, friendId, costRows) {
  for (const row of costRows) {
    await db
      .prepare(
        `
        INSERT INTO friend_costs (
          friend_id,
          game_type,
          star2_cost,
          star3_cost,
          star4_cost,
          car_cost,
          star2_prize,
          star3_prize,
          star4_prize,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(friend_id, game_type)
        DO UPDATE SET
          star2_cost = excluded.star2_cost,
          star3_cost = excluded.star3_cost,
          star4_cost = excluded.star4_cost,
          car_cost = excluded.car_cost,
          star2_prize = excluded.star2_prize,
          star3_prize = excluded.star3_prize,
          star4_prize = excluded.star4_prize,
          updated_at = CURRENT_TIMESTAMP
        `
      )
      .bind(
        friendId,
        row.gameType,
        row.star2Cost,
        row.star3Cost,
        row.star4Cost,
        row.carCost,
        row.star2Prize,
        row.star3Prize,
        row.star4Prize
      )
      .run();
  }
}

export async function setCurrentFriend(db, lineUserId, friendId) {
  await db
    .prepare(
      `
      INSERT INTO user_sessions (
        line_user_id,
        current_friend_id,
        current_game_type,
        pending_action,
        updated_at
      )
      VALUES (?, ?, NULL, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(line_user_id)
      DO UPDATE SET
        current_friend_id = excluded.current_friend_id,
        current_game_type = NULL,
        pending_action = NULL,
        updated_at = CURRENT_TIMESTAMP
      `
      )
    .bind(lineUserId, friendId)
    .run();
}

export async function setCurrentGameType(db, lineUserId, gameType) {
  await db
    .prepare(
      `
      INSERT INTO user_sessions (line_user_id, current_game_type, pending_action, updated_at)
      VALUES (?, ?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(line_user_id)
      DO UPDATE SET
        current_game_type = excluded.current_game_type,
        pending_action = NULL,
        updated_at = CURRENT_TIMESTAMP
      `
    )
    .bind(lineUserId, gameType)
    .run();
}

export async function setPendingAction(db, lineUserId, pendingAction) {
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

export async function clearPendingAction(db, lineUserId) {
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

export async function getCurrentSession(db, lineUserId) {
  return await db
    .prepare(
      `
      SELECT
        friends.id AS friend_id,
        user_sessions.pending_action AS pending_action,
        user_sessions.current_game_type AS game_type,
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

export async function saveRawMessage(db, message) {
  const result = await db
    .prepare(
      `
      INSERT INTO raw_messages (
        friend_id,
        line_user_id,
        message_type,
        game_type,
        raw_text,
        image_message_id
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `
    )
    .bind(
      message.friendId,
      message.lineUserId,
      message.messageType,
      message.gameType,
      message.rawText,
      message.imageMessageId
    )
    .run();

  return result.meta?.last_row_id ?? null;
}

export async function saveParsedEntriesForText(db, message) {
  if (!message.rawMessageId) return [];

  const entries = parseTextToCalculationEntries(message.rawText);

  for (const entry of entries) {
    await db
      .prepare(
        `
        INSERT INTO parsed_entries (
          raw_message_id,
          friend_id,
          line_user_id,
          game_type,
          source_line_text,
          number_part,
          rule_part,
          rows_json,
          calculations_json,
          total_amount,
          error_message,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        `
      )
      .bind(
        message.rawMessageId,
        message.friendId,
        message.lineUserId,
        message.gameType,
        entry.sourceLineText,
        entry.numberPart,
        entry.rulePart,
        JSON.stringify(entry.rows),
        JSON.stringify(entry.calculations),
        entry.totalAmount,
        entry.errorMessage,
        message.createdAt || null
      )
      .run();
  }

  return entries;
}

export async function saveAIParseResult(db, result) {
  await db
    .prepare(
      `
      INSERT INTO ai_parse_results (
        raw_message_id,
        friend_id,
        line_user_id,
        input_type,
        ai_output_json,
        normalized_text,
        status,
        error_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .bind(
      result.rawMessageId,
      result.friendId,
      result.lineUserId,
      result.inputType,
      result.aiOutputJson,
      result.normalizedText,
      result.status,
      result.errorMessage
    )
    .run();
}

export async function getTodayParsedEntriesByFriend(db, friendId) {
  return await getParsedEntriesByFriendAndDate(
    db,
    friendId,
    getTaipeiDateString()
  );
}

export async function getTodayImageMessageCountByFriend(db, friendId) {
  return await getImageMessageCountByFriendAndDate(
    db,
    friendId,
    getTaipeiDateString()
  );
}

export async function getParsedEntriesByFriendAndDate(db, friendId, dateText) {
  const result = await db
    .prepare(
      `
      SELECT
        id,
        game_type,
        source_line_text,
        rows_json,
        calculations_json,
        total_amount,
        error_message,
        created_at
      FROM parsed_entries
      WHERE friend_id = ?
        AND date(created_at, '+8 hours') = ?
      ORDER BY created_at ASC, id ASC
      LIMIT 1000
      `
    )
    .bind(friendId, dateText)
    .all();

  return (result.results || []).map(normalizeParsedEntryFromDb);
}

export async function getRawMessageById(db, rawMessageId) {
  return await db
    .prepare(
      `
      SELECT
        raw_messages.id,
        raw_messages.friend_id,
        raw_messages.line_user_id,
        raw_messages.message_type,
        raw_messages.game_type,
        raw_messages.raw_text,
        raw_messages.image_message_id,
        raw_messages.created_at,
        date(raw_messages.created_at, '+8 hours') AS taipei_date,
        friends.name AS friend_name
      FROM raw_messages
      INNER JOIN friends
        ON friends.id = raw_messages.friend_id
       AND friends.deleted_at IS NULL
      WHERE raw_messages.id = ?
      `
    )
    .bind(rawMessageId)
    .first();
}

export async function getEditableRawMessagesByFriendAndDate(db, friendId, dateText) {
  const result = await db
    .prepare(
      `
      SELECT
        id,
        friend_id,
        line_user_id,
        game_type,
        raw_text,
        created_at,
        date(created_at, '+8 hours') AS taipei_date
      FROM raw_messages
      WHERE friend_id = ?
        AND message_type = 'text'
        AND raw_text IS NOT NULL
        AND date(created_at, '+8 hours') = ?
      ORDER BY created_at ASC, id ASC
      LIMIT 12
      `
    )
    .bind(friendId, dateText)
    .all();

  return result.results || [];
}

export async function getWinningNumber(db, gameType, drawDate) {
  const row = await db
    .prepare(
      `
      SELECT id, game_type, draw_date, numbers_json, updated_at
      FROM winning_numbers
      WHERE game_type = ?
        AND draw_date = ?
      `
    )
    .bind(gameType, drawDate)
    .first();

  if (!row) return null;

  return {
    id: row.id,
    gameType: row.game_type,
    drawDate: row.draw_date,
    numbers: parseJsonOrDefault(row.numbers_json, []),
    updatedAt: row.updated_at,
  };
}

export async function saveWinningNumber(db, gameType, drawDate, numbers) {
  await db
    .prepare(
      `
      INSERT INTO winning_numbers (
        game_type,
        draw_date,
        numbers_json,
        updated_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(game_type, draw_date)
      DO UPDATE SET
        numbers_json = excluded.numbers_json,
        updated_at = CURRENT_TIMESTAMP
      `
    )
    .bind(gameType, drawDate, JSON.stringify(numbers))
    .run();
}

export async function deleteWinningNumber(db, gameType, drawDate) {
  await db
    .prepare(
      `
      DELETE FROM winning_numbers
      WHERE game_type = ?
        AND draw_date = ?
      `
    )
    .bind(gameType, drawDate)
    .run();
}

export async function updateRawTextMessageWithRevision(
  db,
  rawMessage,
  newRawText,
  editorLineUserId
) {
  await db
    .prepare(
      `
      INSERT INTO raw_message_revisions (
        raw_message_id,
        old_raw_text,
        new_raw_text,
        line_user_id
      )
      VALUES (?, ?, ?, ?)
      `
    )
    .bind(rawMessage.id, rawMessage.raw_text, newRawText, editorLineUserId)
    .run();

  await db
    .prepare(
      `
      UPDATE raw_messages
      SET raw_text = ?
      WHERE id = ?
        AND message_type = 'text'
      `
    )
    .bind(newRawText, rawMessage.id)
    .run();

  await db
    .prepare("DELETE FROM parsed_entries WHERE raw_message_id = ?")
    .bind(rawMessage.id)
    .run();
}

export async function getImageMessageCountByFriendAndDate(db, friendId, dateText) {
  const row = await db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM raw_messages
      LEFT JOIN parsed_entries
        ON parsed_entries.raw_message_id = raw_messages.id
      WHERE raw_messages.friend_id = ?
        AND raw_messages.message_type = 'image'
        AND date(raw_messages.created_at, '+8 hours') = ?
        AND parsed_entries.id IS NULL
      `
    )
    .bind(friendId, dateText)
    .first();

  return row?.count || 0;
}

export async function getFriendsWithOrdersByDate(db, dateText) {
  const result = await db
    .prepare(
      `
      SELECT DISTINCT friends.id, friends.name
      FROM friends
      LEFT JOIN raw_messages
        ON raw_messages.friend_id = friends.id
       AND date(raw_messages.created_at, '+8 hours') = ?
      LEFT JOIN parsed_entries
        ON parsed_entries.friend_id = friends.id
       AND date(parsed_entries.created_at, '+8 hours') = ?
      WHERE friends.deleted_at IS NULL
        AND (raw_messages.id IS NOT NULL OR parsed_entries.id IS NOT NULL)
      ORDER BY friends.id ASC
      `
    )
    .bind(dateText, dateText)
    .all();

  return result.results || [];
}

function normalizeParsedEntryFromDb(row) {
  return {
    sourceLineText: row.source_line_text,
    gameType: row.game_type || "539",
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
