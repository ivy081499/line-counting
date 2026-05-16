/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// export default {
//   async fetch(request, env, ctx) {
//     // You can view your logs in the Observability dashboard
//     console.info({ message: 'Hello World Worker received a request!' }); 
//     return new Response('Hello World!');
//   }
// };


// ====================================================================================
// 測試webhook是否有通
// ====================================================================================

// export default {
//   async fetch(request, env, ctx) {
//     const url = new URL(request.url);

//     if (url.pathname === "/") {
//       return new Response("LINE helper is running");
//     }

//     if (url.pathname === "/line/webhook" && request.method === "POST") {
//       return new Response("OK");
//     }

//     return new Response("Not found", { status: 404 });
//   },
// };


// ====================================================================================
// 取得userid
// ====================================================================================

// export default {
//   async fetch(request, env, ctx) {
//     const url = new URL(request.url);

//     if (url.pathname === "/") {
//       return new Response("LINE helper is running");
//     }

//     if (url.pathname === "/line/webhook" && request.method === "POST") {
//       const body = await request.json();

//       for (const event of body.events || []) {
//         //let msg=`收到：${event.message.text}`;
//         let msg = `你的 userId 是：${event.source.userId}`;
//         if (event.type === "message" && event.message.type === "text") {
//           await replyMessage(
//             event.replyToken,
//             msg,
//             env.LINE_CHANNEL_ACCESS_TOKEN
//           );
//         }
//       }

//       return new Response("OK");
//     }

//     return new Response("Not found", { status: 404 });
//   },
// };

// async function replyMessage(replyToken, text, channelAccessToken) {
//   await fetch("https://api.line.me/v2/bot/message/reply", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       Authorization: `Bearer ${channelAccessToken}`,
//     },
//     body: JSON.stringify({
//       replyToken,
//       messages: [
//         {
//           type: "text",
//           text,
//         },
//       ],
//     }),
//   });
// }


// ====================================================================================
// 添加用戶白名單
// ====================================================================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("LINE helper is running");
    }

    if (url.pathname === "/line/webhook" && request.method === "POST") {
      const body = await request.json();

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

  if (text === "選朋友") {
    const friends = await getFriends(env.DB);
    await replyFriendPicker(
      event.replyToken,
      friends,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  if (text.startsWith("#")) {
    const friendName = text.slice(1).trim();

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
    return;
  }

  if (text === "今日整理") {
    await replyMessage(
      event.replyToken,
      "今日整理功能下一步會依朋友彙整今天資料。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  if (text === "朋友報表") {
    const session = await getCurrentSession(env.DB, userId);

    if (!session?.friend_id) {
      await replyMessage(
        event.replyToken,
        "請先點「選朋友」選擇朋友。",
        env.LINE_CHANNEL_ACCESS_TOKEN
      );
      return;
    }

    const messages = await getRecentMessagesByFriend(env.DB, session.friend_id);

    if (messages.length === 0) {
      await replyMessage(
        event.replyToken,
        `${session.friend_name} 目前還沒有資料。`,
        env.LINE_CHANNEL_ACCESS_TOKEN
      );
      return;
    }

    const report = buildSimpleReport(session.friend_name, messages);

    await replyMessage(
      event.replyToken,
      report,
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  if (text === "清除來源") {
    await clearCurrentFriend(env.DB, userId);

    await replyMessage(
      event.replyToken,
      "目前來源已清除。",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  if (text === "新增朋友") {
  await replyMessage(
    event.replyToken,
    "請輸入：新增朋友 朋友名稱\n例如：新增朋友 小華",
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
  return;
}

if (text.startsWith("新增朋友 ")) {
  const friendName = text.replace("新增朋友 ", "").trim();

  if (!friendName) {
    await replyMessage(
      event.replyToken,
      "請輸入朋友名稱，例如：新增朋友 小華",
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const friend = await createFriend(env.DB, friendName);

  await replyMessage(
    event.replyToken,
    `已新增朋友：${friend.name}`,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
  return;
}


  if (text === "說明") {
    await replyMessage(
      event.replyToken,
      [
        "使用方式：",
        "1. 點下方選單的「選朋友」",
        "2. 選擇要整理資料的朋友",
        "3. 傳入朋友給你的文字或圖片",
        "4. 點「朋友報表」產生可轉傳的內容",
      ].join("\n"),
      env.LINE_CHANNEL_ACCESS_TOKEN
    );
    return;
  }

  const session = await getCurrentSession(env.DB, userId);

  if (!session?.friend_id) {
    await replyMessage(
      event.replyToken,
      "請先點「選朋友」選擇這筆資料要歸到哪位朋友。",
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
    `已存到 ${session.friend_name}：${text}`,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function handleImageMessage(event, env, userId) {
  const session = await getCurrentSession(env.DB, userId);

  if (!session?.friend_id) {
    await replyMessage(
      event.replyToken,
      "請先點「選朋友」選擇這張圖片要歸到哪位朋友。",
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
    `已收到圖片，並存到 ${session.friend_name}。圖片解析下一步啟用。`,
    env.LINE_CHANNEL_ACCESS_TOKEN
  );
}

async function getFriends(db) {
  const result = await db
    .prepare("SELECT id, name FROM friends ORDER BY id ASC")
    .all();

  return result.results || [];
}

async function getFriendByName(db, name) {
  return await db
    .prepare("SELECT id, name FROM friends WHERE name = ?")
    .bind(name)
    .first();
}

async function createFriend(db, name) {
  await db
    .prepare("INSERT OR IGNORE INTO friends (name) VALUES (?)")
    .bind(name)
    .run();

  return await getFriendByName(db, name);
}

async function setCurrentFriend(db, lineUserId, friendId) {
  await db
    .prepare(
      `
      INSERT INTO user_sessions (line_user_id, current_friend_id, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(line_user_id)
      DO UPDATE SET
        current_friend_id = excluded.current_friend_id,
        updated_at = CURRENT_TIMESTAMP
      `
    )
    .bind(lineUserId, friendId)
    .run();
}

async function clearCurrentFriend(db, lineUserId) {
  await db
    .prepare(
      `
      INSERT INTO user_sessions (line_user_id, current_friend_id, updated_at)
      VALUES (?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(line_user_id)
      DO UPDATE SET
        current_friend_id = NULL,
        updated_at = CURRENT_TIMESTAMP
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
        user_sessions.current_friend_id AS friend_id,
        friends.name AS friend_name
      FROM user_sessions
      LEFT JOIN friends ON friends.id = user_sessions.current_friend_id
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

async function getRecentMessagesByFriend(db, friendId) {
  const result = await db
    .prepare(
      `
      SELECT id, message_type, raw_text, image_message_id, created_at
      FROM raw_messages
      WHERE friend_id = ?
      ORDER BY created_at DESC
      LIMIT 20
      `
    )
    .bind(friendId)
    .all();

  return result.results || [];
}

function buildSimpleReport(friendName, messages) {
  const lines = [`${friendName} 資料整理`, ""];

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
                  text: "選好後，接下來傳入的資料會歸到這位朋友。",
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
