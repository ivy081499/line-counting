import { formatNumber, formatNumberWithCommas, formatPickLabel } from './utils.js';

export function buildWebReportHtml({
  dateText,
  dates,
  friends,
  selectedFriendId,
  summaries,
  token,
}) {
  const selectedFriend = friends.find((friend) => friend.id === selectedFriendId);
  const pageTitle = selectedFriend
    ? `${selectedFriend.name} ${dateText} 網頁報表`
    : `${dateText} 每日總報表`;
  const totals = summarizeReportTotals(summaries);

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f8;
      --panel: #ffffff;
      --ink: #17202a;
      --muted: #667085;
      --line: #d8dee4;
      --accent: #146c5c;
      --accent-soft: #e6f3ef;
      --danger: #b42318;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    header {
      background: var(--panel);
      border-bottom: 1px solid var(--line);
    }
    .wrap {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
    }
    .top {
      padding: 22px 0 18px;
      display: grid;
      gap: 14px;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    form.controls {
      display: grid;
      grid-template-columns: minmax(0, 220px) minmax(0, 260px) auto;
      gap: 10px;
      align-items: end;
    }
    label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 13px;
    }
    input,
    select,
    button {
      width: 100%;
      min-height: 40px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      font: inherit;
      padding: 8px 10px;
    }
    button {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
      cursor: pointer;
      padding-inline: 18px;
    }
    main {
      padding: 18px 0 32px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .metric {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 13px;
    }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 13px;
    }
    .metric strong {
      display: block;
      margin-top: 4px;
      font-size: 21px;
      line-height: 1.2;
    }
    .friend-report {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-top: 14px;
      overflow: hidden;
    }
    .friend-head {
      padding: 14px 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfd;
    }
    .friend-head h2 {
      margin: 0;
      font-size: 18px;
      letter-spacing: 0;
    }
    .friend-head p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 13px;
    }
    .amount {
      text-align: right;
      white-space: nowrap;
      font-weight: 700;
    }
    .game-section {
      border-top: 1px solid var(--line);
      background: #fff;
    }
    .game-head {
      padding: 12px 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      background: #fff;
    }
    .game-head h3 {
      margin: 0;
      font-size: 15px;
      letter-spacing: 0;
    }
    .game-head p {
      margin: 3px 0 0;
      color: var(--muted);
      font-size: 13px;
    }
    .game-amount {
      text-align: right;
      white-space: nowrap;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }
    details.entries-toggle {
      border-top: 0;
    }
    details.entries-toggle > summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 16px;
      cursor: pointer;
      color: var(--accent);
      font-weight: 700;
      list-style: none;
      background: #fff;
    }
    details.entries-toggle > summary::-webkit-details-marker {
      display: none;
    }
    details.entries-toggle > summary::after {
      content: "展開";
      color: var(--muted);
      font-size: 13px;
      font-weight: 600;
    }
    details.entries-toggle[open] > summary::after {
      content: "收起";
    }
    .table-scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 760px;
    }
    th,
    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 14px;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      background: #fbfcfd;
    }
    tr:last-child td {
      border-bottom: 0;
    }
    .source {
      min-width: 260px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .tag {
      display: inline-block;
      margin: 0 4px 4px 0;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
    }
    .error {
      color: var(--danger);
      font-weight: 700;
    }
    .empty {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 22px;
      color: var(--muted);
    }
    @media (max-width: 760px) {
      .wrap {
        width: min(100% - 20px, 1120px);
      }
      form.controls,
      .summary-grid {
        grid-template-columns: 1fr;
      }
      .friend-head {
        grid-template-columns: 1fr;
      }
      .game-head {
        grid-template-columns: 1fr;
      }
      .amount {
        margin-top: 8px;
        text-align: left;
      }
      .game-amount {
        text-align: left;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap top">
      <h1>${escapeHtml(pageTitle)}</h1>
      <form class="controls" method="get" action="/reports">
        ${token ? `<input type="hidden" name="token" value="${escapeAttribute(token)}">` : ""}
        <label>
          日期
          <input type="date" name="date" value="${escapeAttribute(dateText)}" required>
        </label>
        <label>
          朋友
          <select name="friendId">
            <option value="">全部朋友</option>
            ${friends.map((friend) => `<option value="${friend.id}"${friend.id === selectedFriendId ? " selected" : ""}>${escapeHtml(friend.name)}</option>`).join("")}
          </select>
        </label>
        <button type="submit">查看</button>
      </form>
    </div>
  </header>
  <main>
    <div class="wrap">
      ${renderTopSummary(totals)}
      ${summaries.length === 0 ? `<div class="empty">${escapeHtml(dateText)} 沒有注單資料。</div>` : summaries.map(renderFriendReport).join("")}
    </div>
  </main>
</body>
</html>`;
}

export function buildWebReportForbiddenHtml() {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>無法查看報表</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7f8; color: #17202a; }
    main { width: min(560px, calc(100% - 32px)); margin: 64px auto; background: #fff; border: 1px solid #d8dee4; border-radius: 8px; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 22px; letter-spacing: 0; }
    p { margin: 0; color: #667085; }
  </style>
</head>
<body>
  <main>
    <h1>無法查看報表</h1>
    <p>這個報表連結缺少有效的授權 token。</p>
  </main>
</body>
</html>`;
}

function renderTopSummary(totals) {
  return `<section class="summary-grid" aria-label="總覽">
    ${renderMetric("朋友數", totals.friendCount)}
    ${renderMetric("下注總額", formatMoney(totals.betAmount))}
    ${renderMetric("中獎金額", formatMoney(totals.prizeAmount))}
    ${renderMetric("差額", formatMoney(totals.betAmount - totals.prizeAmount))}
  </section>`;
}

function renderMetric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function renderFriendReport(summary) {
  return `<section class="friend-report">
    <div class="friend-head">
      <div>
        <h2>${escapeHtml(summary.friend.name)}</h2>
        <p>全部統計：${renderCountSummary(summary.counts)}${summary.imageCount > 0 ? `，圖片 ${summary.imageCount} 筆尚未解析` : ""}</p>
      </div>
      <div class="amount">
        下注 ${formatMoney(summary.betAmount)}<br>
        中獎 ${formatMoney(summary.prizeAmount)}<br>
        差額 ${formatMoney(summary.betAmount - summary.prizeAmount)}
      </div>
    </div>
    ${summary.gameSummaries.map(renderGameSection).join("") || `<div class="empty">沒有可計算的文字資料。</div>`}
  </section>`;
}

function renderGameSection(gameSummary) {
  return `<section class="game-section">
    <div class="game-head">
      <div>
        <h3>${escapeHtml(gameSummary.gameType)}</h3>
        <p>${renderCountSummary(gameSummary.counts)}</p>
      </div>
      <div class="game-amount">
        下注 ${formatMoney(gameSummary.betAmount)}<br>
        中獎 ${formatMoney(gameSummary.prizeAmount)}<br>
        差額 ${formatMoney(gameSummary.betAmount - gameSummary.prizeAmount)}
      </div>
    </div>
    <details class="entries-toggle">
      <summary>${escapeHtml(gameSummary.gameType)} 注單內容 ${gameSummary.entries.length} 筆</summary>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>注單</th>
              <th>彩種</th>
              <th>支數</th>
              <th>下注</th>
              <th>中獎</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            ${gameSummary.entries.map((entry, index) => renderEntryRow(entry, index)).join("") || `<tr><td colspan="7">沒有可計算的文字資料。</td></tr>`}
          </tbody>
        </table>
      </div>
    </details>
  </section>`;
}

function renderEntryRow(entry, index) {
  const calculations = entry.calculations
    .map((calculation) => `<span class="tag">${escapeHtml(formatPickLabel(calculation.pick))}${escapeHtml(formatNumber(calculation.amount))}</span>`)
    .join("");
  const status = entry.errorMessage
    ? `<span class="error">${escapeHtml(entry.errorMessage)}</span>`
    : "已計算";

  return `<tr>
    <td>${index + 1}</td>
    <td class="source">${escapeHtml(entry.sourceLineText)}</td>
    <td>${escapeHtml(entry.gameType || "539")}</td>
    <td>${calculations || "-"}</td>
    <td>${formatMoney(entry.betAmount || 0)}</td>
    <td>${formatMoney(entry.prizeAmount || 0)}</td>
    <td>${status}</td>
  </tr>`;
}

function renderCountSummary(counts) {
  return [
    `${formatPickLabel(2)}${formatNumber(counts[2])}`,
    `${formatPickLabel(3)}${formatNumber(counts[3])}`,
    `${formatPickLabel(4)}${formatNumber(counts[4])}`,
    `車${formatNumber(counts.car)}`,
  ].join("、");
}

function summarizeReportTotals(summaries) {
  return summaries.reduce(
    (totals, summary) => ({
      friendCount: totals.friendCount + 1,
      betAmount: totals.betAmount + summary.betAmount,
      prizeAmount: totals.prizeAmount + summary.prizeAmount,
    }),
    { friendCount: 0, betAmount: 0, prizeAmount: 0 }
  );
}

function formatMoney(value) {
  return formatNumberWithCommas(value || 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
