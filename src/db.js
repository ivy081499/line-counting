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
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (friend_id, game_type),
        FOREIGN KEY (friend_id) REFERENCES friends(id)
      )
      `
    )
    .run();

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
      SELECT game_type, star2_cost, star3_cost, star4_cost, car_cost, updated_at
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
    return { costs, usedDefaultCosts: false };
  }

  await saveFriendCosts(db, friendId, DEFAULT_COST_ROWS);
  costs = await getFriendCosts(db, friendId);

  return { costs, usedDefaultCosts: true };
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
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(friend_id, game_type)
        DO UPDATE SET
          star2_cost = excluded.star2_cost,
          star3_cost = excluded.star3_cost,
          star4_cost = excluded.star4_cost,
          car_cost = excluded.car_cost,
          updated_at = CURRENT_TIMESTAMP
        `
      )
      .bind(
        friendId,
        row.gameType,
        row.star2Cost,
        row.star3Cost,
        row.star4Cost,
        row.carCost
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

export async function saveParsedEntriesForText(db, message) {
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
