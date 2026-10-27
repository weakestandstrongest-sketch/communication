// UI redesign checks: 予定 (calendar zoom, month roll, timeline), profile photo / group icon upload,
// floating tab bar, LINE-style home. Usage: node tests/e2e/design.mjs [screenshotDir]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { APP_URL, admin, createUser, signedInContext } from "./session.mjs";
import { solidPng } from "./png.mjs";

const { chromium, devices } = createRequire(import.meta.url)("playwright");
const shots = process.argv[2] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });

let passed = 0;
let failed = 0;
const pages = {};
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n    ${String(e?.message ?? e).split("\n").slice(0, 5).join("\n    ")}`);
    if (shots) for (const [k, p] of Object.entries(pages)) await p.screenshot({ path: path.join(shots, `fail-d${failed}-${k}.png`) }).catch(() => undefined);
  }
}
const shot = (p, name, fullPage = false) => (shots ? p.screenshot({ path: path.join(shots, `${name}.png`), fullPage }) : null);

// "Today" in Japan, independent of the machine's time zone.
const jst = new Date(Date.now() + 9 * 3600_000);
const Y = jst.getUTCFullYear();
const M = jst.getUTCMonth();
const D = jst.getUTCDate();
const at = (dayOffset, h, min = 0) => new Date(Date.UTC(Y, M, D + dayOffset, h - 9, min)).toISOString();

const browser = await chromium.launch();
const iphone = devices["iPhone 13"];
const owner = await createUser("高橋 美咲");
const member = await createUser("伊藤 健");
const ctxA = await signedInContext(browser, owner, { ...iphone });
const ctxB = await signedInContext(browser, member, { ...iphone, colorScheme: "dark" });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
pages.A = A;
pages.B = B;

let groupId = "";
await step("seed: group, members, events, poll", async () => {
  groupId = (await owner.client.rpc("create_group", { p_name: "軽音サークル", p_color: "violet" })).data;
  const code = (await owner.client.from("group_invites").select("code").eq("group_id", groupId).single()).data.code;
  await member.client.rpc("join_group", { p_code: code });
  const mk = (title, s, e, extra = {}) =>
    owner.client.rpc("create_event", { p_group_id: groupId, p_title: title, p_starts_at: s, p_ends_at: e, p_post_to_chat: false, ...extra });
  const results = await Promise.all([
    mk("朝練", at(0, 7, 0), at(0, 8, 0), { p_category: "practice", p_location: "第1スタジオ" }),
    mk("全体ミーティング", at(0, 13, 0), at(0, 14, 30), { p_category: "meeting", p_location: "学生会館 2F" }),
    mk("ライブリハーサル", at(0, 16, 0), at(0, 19, 0), { p_category: "match", p_location: "ライブハウス Z" }),
    mk("文化祭 準備", at(0, 0, 0), at(0, 23, 59), { p_category: "social", p_all_day: true }),
    mk("新歓ライブ", at(2, 18, 0), at(2, 20, 0), { p_category: "social" }),
    mk("合宿", at(5, 9, 0), at(6, 17, 0), { p_category: "trip" }),
    mk("機材チェック", at(-1, 12, 0), at(-1, 13, 0), { p_category: "other" }),
  ]);
  const bad = results.find((r) => r.error);
  if (bad) throw new Error(bad.error.message);
  const poll = await owner.client.rpc("create_poll", {
    p_group_id: groupId,
    p_title: "ライブの出演曲アンケート",
    p_options: ["曲A", "曲B"],
    p_deadline: new Date(Date.now() + 5 * 3600_000).toISOString(),
  });
  if (poll.error) throw new Error(poll.error.message);
});

await step("tab bar is a floating rounded translucent pill with 予定 label", async () => {
  await B.goto(APP_URL);
  const nav = B.getByRole("navigation", { name: "メインナビゲーション" });
  await nav.getByRole("link", { name: /予定/ }).waitFor();
  if (await nav.getByRole("link", { name: /カレンダー/ }).count()) throw new Error("still labelled カレンダー");
  const bar = nav.locator("ul");
  const box = await bar.boundingBox();
  const vp = B.viewportSize();
  if (!box || box.x < 6 || vp.width - (box.x + box.width) < 6) throw new Error("tab bar touches the screen edges");
  const style = await bar.evaluate((el) => {
    const s = getComputedStyle(el);
    return { radius: parseFloat(s.borderTopLeftRadius), blur: s.backdropFilter || s.webkitBackdropFilter };
  });
  if (style.radius < 24) throw new Error(`radius ${style.radius}`);
  if (!/blur/.test(style.blur)) throw new Error(`no backdrop blur: ${style.blur}`);
  await shot(B, "d01-home-dark");
});

await step("home is LINE-style: profile header, search, list rows, quick actions", async () => {
  await A.goto(APP_URL);
  await A.getByRole("heading", { name: "高橋 美咲" }).waitFor();
  await A.getByRole("button", { name: /検索/ }).waitFor();
  await A.getByRole("heading", { name: "リスト" }).or(A.getByText("リスト", { exact: true })).first().waitFor();
  await A.getByRole("link", { name: /未回答の投票/ }).waitFor();
  await A.getByRole("link", { name: "投票を作成" }).waitFor();
  await shot(A, "d02-home-light");
  await A.getByRole("button", { name: /検索/ }).click();
  await A.getByRole("searchbox", { name: "検索" }).fill("ライブ");
  const dialog = A.getByRole("dialog", { name: "検索" });
  await dialog.getByRole("link", { name: /ライブリハーサル/ }).waitFor();
  await dialog.getByRole("link", { name: /ライブの出演曲アンケート/ }).waitFor();
  await shot(A, "d03-search");
  await A.getByRole("searchbox", { name: "検索" }).fill("伊藤");
  await dialog.getByRole("link", { name: /伊藤 健/ }).waitFor();
  await A.keyboard.press("Escape");
});

await step("予定: mode switch between カレンダー and タイムライン", async () => {
  await A.goto(`${APP_URL}/calendar`);
  await A.getByRole("heading", { name: "予定", level: 1 }).first().waitFor();
  await A.getByRole("tab", { name: "カレンダー" }).waitFor();
  await A.getByRole("tab", { name: "タイムライン" }).waitFor();
});

await step("calendar zoom: dots → event titles → details", async () => {
  const grid = A.locator("[data-zoom]");
  if ((await grid.getAttribute("data-zoom")) !== "0") throw new Error("should start at the smallest zoom");
  const cell = A.getByRole("gridcell", { name: new RegExp(`${M + 1}月${D}日`) });
  if (await cell.getByText("朝練").count()) throw new Error("titles visible at smallest zoom");
  await shot(A, "d04-calendar-zoom0");
  await A.getByRole("button", { name: "拡大" }).click();
  await cell.getByText("朝練").waitFor();
  if ((await grid.getAttribute("data-zoom")) !== "1") throw new Error("zoom 1 expected");
  await shot(A, "d05-calendar-zoom1");
  await A.getByRole("button", { name: "拡大" }).click();
  await cell.getByText("7:00").first().waitFor();
  await shot(A, "d06-calendar-zoom2");
  await shot(A, "d06b-calendar-zoom2-full", true);
  await A.getByRole("button", { name: "縮小" }).click();
  if ((await grid.getAttribute("data-zoom")) !== "1") throw new Error("zoom out failed");
});

await step("calendar zoom responds to a two-finger pinch", async () => {
  const cdp = await ctxA.newCDPSession(A);
  const grid = A.locator("[data-zoom]");
  await A.getByRole("button", { name: "縮小" }).click();
  await A.waitForTimeout(500); // wait for the cells to finish resizing
  const box = await grid.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const touch = async (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  // spread fingers apart
  await touch("touchStart", [[cx - 30, cy], [cx + 30, cy]]);
  for (let d = 30; d <= 38; d += 2) {
    await touch("touchMove", [[cx - d, cy], [cx + d, cy]]);
    await A.waitForTimeout(30);
  }
  await touch("touchEnd", []);
  await A.waitForTimeout(300);
  if ((await grid.getAttribute("data-zoom")) !== "1") throw new Error(`pinch-out should zoom in, got ${await grid.getAttribute("data-zoom")}`);
  // pinch together
  await touch("touchStart", [[cx - 110, cy], [cx + 110, cy]]);
  for (let d = 110; d >= 20; d -= 10) {
    await touch("touchMove", [[cx - d, cy], [cx + d, cy]]);
    await A.waitForTimeout(30);
  }
  await touch("touchEnd", []);
  await A.waitForTimeout(300);
  if ((await grid.getAttribute("data-zoom")) !== "0") throw new Error(`pinch-in should zoom out, got ${await grid.getAttribute("data-zoom")}`);
});

await step("month changes with a rolling number and swipe", async () => {
  const ym = (offset) => {
    const d = new Date(Date.UTC(Y, M + offset, 1));
    return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月`;
  };
  const label = (offset) => A.getByRole("heading", { level: 2, name: new RegExp(`^${ym(offset)}$`) });
  await label(0).waitFor();
  await A.getByRole("button", { name: "次の月" }).click();
  // while rolling, both the old and the new number are in the DOM
  const rolling = await A.locator(".animate-roll-out").count();
  if (rolling < 1) throw new Error("no roll-out animation element");
  await label(1).waitFor();
  await A.waitForTimeout(600);
  const gridBox = await A.locator("[data-zoom]").boundingBox();
  const cx = gridBox.x + gridBox.width / 2;
  const cy = gridBox.y + 200;
  const cdp = await ctxA.newCDPSession(A);
  const t = (type, x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: cy, id: 0 }] });
  await t("touchStart", cx + 90);
  for (let x = cx + 90; x >= cx - 110; x -= 25) await t("touchMove", x);
  await t("touchEnd", cx - 110);
  await A.waitForTimeout(500);
  await label(2).waitFor();
  await A.getByRole("button", { name: "今日" }).first().click();
  await label(0).waitFor();
});

await step("the selection circle flies to the same day of the next month", async () => {
  await A.getByRole("gridcell", { name: new RegExp(`^${M + 1}月${D}日`) }).click();
  await A.waitForTimeout(500);
  await A.getByRole("button", { name: "次の月" }).click();
  await A.waitForTimeout(160);
  const mid = await A.evaluate(() => {
    const ball = document.querySelector("[data-zoom] > span[aria-hidden]");
    const cs = getComputedStyle(ball);
    return { opacity: Number(cs.opacity), transform: cs.transform, flying: Boolean(document.querySelector("[data-sel][data-flying]")) };
  });
  if (!(mid.opacity > 0) || mid.transform === "none" || !mid.flying) throw new Error(`circle is not in flight: ${JSON.stringify(mid)}`);
  if (shots) await shot(A, "design-circle-flight");
  await A.waitForTimeout(700);
  const next = new Date(Date.UTC(Y, M + 1, 1));
  const len = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  const sel = A.locator('[role="gridcell"][aria-selected="true"]');
  const name = await sel.getAttribute("aria-label");
  if (!name.startsWith(`${next.getUTCMonth() + 1}月${Math.min(D, len)}日`)) throw new Error(`selection did not carry over: ${name}`);
  const after = await A.evaluate(() => ({
    opacity: Number(getComputedStyle(document.querySelector("[data-zoom] > span[aria-hidden]")).opacity),
    flying: Boolean(document.querySelector("[data-flying]")),
    bg: getComputedStyle(document.querySelector("[data-sel]")).backgroundColor,
  }));
  if (after.opacity !== 0 || after.flying || after.bg === "rgba(0, 0, 0, 0)") throw new Error(`circle did not land: ${JSON.stringify(after)}`);
  await A.getByRole("button", { name: "今日" }).first().click();
  await A.waitForTimeout(700);
});

await step("holidays are marked in red", async () => {
  await A.getByRole("button", { name: "拡大" }).click();
  // Navigate to November of the current year when possible: 文化の日 (11/3)
  for (let i = 0; i < 12 && !(await A.getByRole("heading", { level: 2, name: new RegExp(`^${Y}年11月$`) }).count()); i++) await A.getByRole("button", { name: "次の月" }).click();
  await A.getByRole("gridcell", { name: /11月3日、文化の日/ }).waitFor();
  await A.getByRole("button", { name: "今日" }).first().click();
  await A.getByRole("button", { name: "縮小" }).click();
});

await step("timeline shows the day like a structured planner", async () => {
  await A.getByRole("tab", { name: "タイムライン" }).click();
  await A.getByRole("tablist", { name: "週の日付" }).waitFor();
  await A.getByRole("link", { name: /朝練、/ }).waitFor();
  await A.getByRole("link", { name: /全体ミーティング、/ }).waitFor();
  await A.getByRole("link", { name: /ライブリハーサル、/ }).waitFor();
  await A.getByText(/空き時間 \d/).first().waitFor();
  await A.getByLabel("終日の予定").getByText("文化祭 準備").waitFor();
  await A.getByRole("link", { name: /ライブの出演曲アンケート/ }).first().waitFor();
  await A.getByLabel(/^現在 \d/).waitFor();
  await A.getByText(/回答が必要/).waitFor();
  await shot(A, "d07-timeline");
  await shot(A, "d07b-timeline-full", true);
  // week strip: tomorrow has no event, day after tomorrow has 新歓ライブ
  const base = new Date(Date.UTC(Y, M, D + 2));
  await A.getByRole("tab", { name: new RegExp(`${base.getUTCMonth() + 1}月${base.getUTCDate()}日.*予定1件`) }).click();
  await A.getByRole("link", { name: /新歓ライブ、/ }).waitFor();
  await A.getByRole("button", { name: "今日" }).first().click();
  await A.getByRole("link", { name: /朝練、/ }).waitFor();
});

await step("selected day carries over from calendar to timeline", async () => {
  await A.getByRole("tab", { name: "カレンダー" }).click();
  const base = new Date(Date.UTC(Y, M, D + 2));
  await A.getByRole("gridcell", { name: new RegExp(`${base.getUTCMonth() + 1}月${base.getUTCDate()}日`) }).click();
  await A.getByRole("link", { name: /新歓ライブ/ }).first().waitFor();
  await A.getByRole("tab", { name: "タイムライン" }).click();
  await A.getByRole("link", { name: /新歓ライブ、/ }).waitFor();
  await A.getByRole("button", { name: "今日" }).first().click();
});

await step("a member uploads a profile photo that is square-cropped and shown to others", async () => {
  await B.goto(`${APP_URL}/settings`);
  await B.getByRole("button", { name: "プロフィール写真を変更" }).first().waitFor();
  await B.locator('input[type=file]').first().setInputFiles({ name: "me.png", mimeType: "image/png", buffer: solidPng(220, 90, 60, 300, 180) });
  await B.getByText("プロフィール写真を変更しました").waitFor({ timeout: 10000 });
  const { data } = await admin.from("profiles").select("avatar_url").eq("id", member.id).single();
  if (!data.avatar_url?.startsWith(`u/${member.id}/`)) throw new Error(`avatar_url = ${data.avatar_url}`);
  const img = B.locator("img[src*='/storage/v1/object/sign/media/u/']:visible").first();
  await img.waitFor({ timeout: 10000 });
  const size = await img.evaluate((el) => new Promise((r) => (el.complete ? r([el.naturalWidth, el.naturalHeight]) : (el.onload = () => r([el.naturalWidth, el.naturalHeight])))));
  if (size[0] !== size[1] || size[0] < 100) throw new Error(`not square: ${size}`);
  // the owner (another user in the group) sees the uploaded photo next to the member's name
  await A.goto(`${APP_URL}/groups/${groupId}`);
  await A.getByRole("tab", { name: "メンバー" }).click();
  await A.locator("img[src*='/storage/v1/object/sign/media/u/']:visible").first().waitFor({ timeout: 10000 });
  await shot(A, "d08-members-photo");
  // removing the photo goes back to the initial
  await B.getByRole("button", { name: "写真を削除" }).click();
  await B.getByText("プロフィール写真を削除しました").waitFor();
});

await step("an admin sets the group icon; members see it; members cannot", async () => {
  await A.goto(`${APP_URL}/groups/${groupId}/settings`);
  await A.locator('input[type=file]').first().setInputFiles({ name: "icon.png", mimeType: "image/png", buffer: solidPng(110, 70, 210, 256, 256) });
  await A.getByText("グループのアイコンを変更しました").waitFor({ timeout: 10000 });
  const { data } = await admin.from("groups").select("icon_path").eq("id", groupId).single();
  if (!data.icon_path?.startsWith(`g/${groupId}/icon/`)) throw new Error(`icon_path = ${data.icon_path}`);
  await B.goto(`${APP_URL}/talk`);
  await B.locator("img[src*='/icon/']:visible").first().waitFor({ timeout: 10000 });
  await shot(B, "d09-talk-list-icon");
  await B.goto(`${APP_URL}/groups/${groupId}/settings`);
  await B.getByText("このグループのプッシュ通知").waitFor();
  if (await B.getByRole("button", { name: "アイコンを変更" }).count()) throw new Error("member can see the icon control");
});

await step("settings screens look right (light and dark)", async () => {
  await A.goto(`${APP_URL}/settings`);
  await A.getByText("プロフィール", { exact: true }).waitFor();
  await shot(A, "d10-settings-light");
  await B.goto(`${APP_URL}/calendar`);
  await B.getByRole("tab", { name: "タイムライン" }).click();
  await B.waitForTimeout(400);
  await shot(B, "d11-timeline-dark");
  await shot(B, "d11b-timeline-dark-full", true);
  await B.getByRole("tab", { name: "カレンダー" }).click();
  await B.getByRole("button", { name: "拡大" }).click();
  await B.getByRole("button", { name: "拡大" }).click();
  await B.waitForTimeout(500);
  await shot(B, "d12-calendar-zoom2-dark");
});

await step("calendar header shows the year to the right of 「10月」, not above 月", async () => {
  await A.goto(`${APP_URL}/calendar`);
  const heading = A.getByRole("heading", { level: 2, name: new RegExp(`^${Y}年${M + 1}月$`) });
  await heading.waitFor();
  // the number, 月 and the year sit inside the button that opens the year/month wheel
  const parts = await heading.locator("button").evaluate((el) => [...el.children].map((c) => { const b = c.getBoundingClientRect(); return { text: c.textContent.trim(), left: b.left, right: b.right, bottom: b.bottom }; }));
  const [num, month, year] = parts;
  if (!(month.left >= num.right - 2 && year.left >= month.right - 2)) throw new Error(`order is wrong: ${JSON.stringify(parts)}`);
  if (Math.abs(year.bottom - month.bottom) > 6) throw new Error(`year is not on the same line as 月: ${JSON.stringify(parts)}`);
  if (year.text !== `${Y}年` || month.text !== "月") throw new Error(JSON.stringify(parts));
});

await step("tab bar highlight slides to the tapped tab with a jelly stretch", async () => {
  await A.goto(APP_URL);
  const nav = A.getByRole("navigation", { name: "メインナビゲーション" });
  const hl = nav.locator("ul > span").first();
  await hl.waitFor({ state: "attached" });
  await A.waitForTimeout(900);
  const x0 = (await hl.boundingBox()).x;
  await nav.getByRole("link", { name: /投票/ }).click();
  await A.waitForURL(/\/polls/);
  // during the move the inner element runs the jelly animation
  const animName = await hl.locator("span").evaluate((el) => getComputedStyle(el).animationName);
  if (!/jelly/.test(animName)) throw new Error(`no jelly animation: ${animName}`);
  await A.waitForTimeout(1000);
  const x1 = (await hl.boundingBox()).x;
  const tab = await nav.getByRole("link", { name: /投票/ }).boundingBox();
  if (x1 - x0 < 100) throw new Error(`highlight did not move (${x0} → ${x1})`);
  if (Math.abs(x1 - (tab.x)) > 10) throw new Error(`highlight not under the tapped tab (${x1} vs ${tab.x})`);
  await shot(A, "d13-tabbar-polls");
});

await step("意見箱: post anonymously, thread replies get aliases, likes, moderation", async () => {
  const leaked = [];
  for (const [label, p] of [["A", A], ["B", B]]) {
    p.on("response", async (r) => {
      if (!/\/rest\/v1\/rpc\/(list_feedback|get_feedback_thread)/.test(r.url())) return;
      const body = await r.text().catch(() => "");
      for (const id of [owner.id, member.id]) if (body.includes(id)) leaked.push(`${label}: ${r.url()} contains ${id}`);
    });
  }
  // entry points
  await A.goto(`${APP_URL}/groups/${groupId}`);
  await A.getByRole("link", { name: "意見箱" }).click();
  await A.waitForURL(/\/feedback$/);
  await A.getByText("投稿者は誰にも（管理者にも）表示されません").waitFor();
  await A.getByText("まだ意見はありません").waitFor();
  // member posts
  await B.goto(`${APP_URL}/groups/${groupId}/feedback`);
  await B.getByRole("button", { name: /いま思っていること/ }).click();
  const dialog = B.getByRole("dialog", { name: "匿名で意見を投稿" });
  await dialog.getByLabel("意見・感想").fill("Autumn Leaves のイントロ、ベースとドラムがずれている気がします");
  await dialog.getByLabel(/お題・曲名/).fill("Autumn Leaves");
  await dialog.getByRole("button", { name: "匿名で投稿する" }).click();
  await B.waitForURL(/\/feedback\/[0-9a-f-]{36}$/);
  const postUrl = B.url();
  await B.getByLabel("元の投稿").getByText("Autumn Leaves のイントロ").waitFor();
  await B.getByLabel("元の投稿").getByText("あなた").waitFor();
  await shot(B, "d14-feedback-thread-dark");
  // the owner sees it appear in the feed in real time, anonymously
  await A.getByRole("article", { name: "匿名の意見" }).getByText("Autumn Leaves のイントロ").waitFor({ timeout: 10000 });
  if (await A.getByRole("article", { name: "匿名の意見" }).getByText("伊藤 健").count()) throw new Error("author name visible");
  if (await A.getByRole("article", { name: "匿名の意見" }).getByText("あなた").count()) throw new Error("A should not be marked as author");
  await shot(A, "d15-feedback-feed");
  // owner replies from the thread → alias 匿名A; the poster sees it and replies as スレ主
  await A.goto(postUrl);
  await A.getByLabel("匿名で返信").fill("確かに。次の練習でテンポを合わせよう");
  await A.getByRole("button", { name: "返信を送信" }).click();
  await A.getByRole("article", { name: "匿名Aの返信" }).waitFor({ timeout: 10000 });
  await B.getByRole("article", { name: "匿名Aの返信" }).waitFor({ timeout: 10000 });
  await B.getByLabel("匿名で返信").fill("ありがとうございます！");
  await B.getByRole("button", { name: "返信を送信" }).click();
  await B.getByRole("article", { name: "スレ主の返信" }).getByText("ありがとうございます！").waitFor({ timeout: 10000 });
  await A.getByRole("article", { name: "スレ主の返信" }).waitFor({ timeout: 10000 });
  await shot(A, "d16-feedback-thread");
  // like
  await A.getByLabel("元の投稿").getByRole("button", { name: /いいね 0件/ }).click();
  await A.getByLabel("元の投稿").getByRole("button", { name: /いいね 1件、いいね済み/ }).waitFor();
  await B.getByLabel("元の投稿").getByRole("button", { name: /いいね 1件$/ }).waitFor({ timeout: 10000 });
  // the poster got an in-app notification about the reply, without a name
  await B.goto(`${APP_URL}/notifications`);
  await B.getByText("あなたの意見に返信がありました").waitFor();
  // topic filter
  await A.goto(`${APP_URL}/groups/${groupId}/feedback`);
  await A.getByRole("tab", { name: /♪ Autumn Leaves/ }).click();
  await A.getByRole("article", { name: "匿名の意見" }).getByText("Autumn Leaves のイントロ").waitFor();
  // admin moderation (without learning who wrote it) and author delete
  await B.goto(`${APP_URL}/groups/${groupId}/feedback`);
  await B.getByRole("button", { name: /いま思っていること/ }).click();
  await B.getByRole("dialog").getByLabel("意見・感想").fill("削除テスト用の投稿");
  await B.getByRole("dialog").getByRole("button", { name: "匿名で投稿する" }).click();
  await B.waitForURL(/\/feedback\/[0-9a-f-]{36}$/);
  await A.goto(`${APP_URL}/groups/${groupId}/feedback`);
  const target = A.getByRole("article", { name: "匿名の意見" }).filter({ hasText: "削除テスト用の投稿" });
  await target.getByRole("button", { name: "メニュー" }).click();
  await A.getByRole("button", { name: "管理者として削除" }).click();
  await A.getByRole("button", { name: "削除", exact: true }).click();
  await A.getByText("投稿を削除しました").waitFor();
  if (await A.getByText("削除テスト用の投稿").count()) throw new Error("moderated post still visible");
  await B.goto(`${APP_URL}/groups/${groupId}/feedback`);
  const own = B.getByRole("article", { name: "匿名の意見" }).filter({ hasText: "Autumn Leaves のイントロ" });
  await own.getByRole("button", { name: "メニュー" }).click();
  await B.getByRole("button", { name: "自分の投稿を削除" }).click();
  await B.getByRole("button", { name: "削除", exact: true }).click();
  await B.getByText("投稿を削除しました").waitFor();
  if (leaked.length) throw new Error(`author ids leaked in responses:\n${leaked.join("\n")}`);
});

await step("意見箱 fits a 320px screen", async () => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, locale: "ja-JP" });
  const { sessionCookies } = await import("./session.mjs");
  await ctx.addCookies(sessionCookies(member.session));
  const p = await ctx.newPage();
  await member.client.rpc("create_feedback_post", { p_group_id: groupId, p_body: "とても長い意見です。".repeat(30), p_topic: "とても長いお題の名前をつけてみるテスト" });
  await p.goto(`${APP_URL}/groups/${groupId}/feedback`);
  await p.getByRole("article", { name: "匿名の意見" }).first().waitFor();
  await p.waitForTimeout(600);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - 320);
  if (over > 1) throw new Error(`feed overflows by ${over}px`);
  await shot(p, "d17-feedback-320");
  await ctx.close();
});

await step("header buttons are gone; 予定 and 投票 have a round + button at the bottom right", async () => {
  await A.goto(`${APP_URL}/calendar`);
  await A.getByRole("heading", { name: "予定", level: 1 }).first().waitFor();
  const vp = A.viewportSize();
  for (const [url, label] of [["/calendar", "予定を追加"], ["/polls", "投票を作成"]]) {
    await A.goto(`${APP_URL}${url}`);
    const fab = A.getByRole("link", { name: label });
    await fab.waitFor();
    if ((await A.locator("main").getByRole("link", { name: /^\+? ?(予定|作成)$/ }).count()) > 0) throw new Error(`${url}: header button still exists`);
    const box = await fab.boundingBox();
    if (box.width < 50 || Math.abs(box.width - box.height) > 1) throw new Error(`${url}: not round (${box.width}x${box.height})`);
    if (vp.width - (box.x + box.width) > 24) throw new Error(`${url}: not at the right edge`);
    const bar = await A.getByRole("navigation", { name: "メインナビゲーション" }).locator("ul").boundingBox();
    if (box.y + box.height > bar.y) throw new Error(`${url}: overlaps the tab bar`);
  }
  await shot(A, "d18-polls-fab");
  await A.getByRole("link", { name: "投票を作成" }).click();
  await A.waitForURL(/\/polls\/new/);
  await A.getByLabel("質問").waitFor();
});

await step("creating an event returns to the calendar on its day (no personal option any more)", async () => {
  await A.goto(`${APP_URL}/calendar`);
  if (await A.getByRole("tab", { name: "個人" }).count()) throw new Error("the 個人 filter is still shown");
  await A.getByRole("link", { name: "予定を追加" }).click();
  await A.getByLabel("グループ", { exact: true }).waitFor();
  if (await A.getByRole("option", { name: /自分だけ/ }).count()) throw new Error("the personal option is still offered");
  await A.getByLabel("グループ", { exact: true }).selectOption(groupId);
  await A.getByLabel("タイトル").fill("譜面の配布");
  await A.getByRole("button", { name: "予定を作成" }).click();
  // after creating, the app returns to the calendar with the event's day selected
  await A.waitForURL(/\/calendar$/);
  await A.getByRole("tab", { name: "カレンダー", selected: true }).waitFor();
  const sel = A.locator('[role="gridcell"][aria-selected="true"]');
  const label = await sel.getAttribute("aria-label");
  if (!label.includes("月")) throw new Error(`no day selected: ${label}`);
  await A.getByText("譜面の配布").first().waitFor();
  // the selected day's number stays readable on its circle (it used to turn white on white for today in dark mode)
  for (const scheme of ["light", "dark"]) {
    await A.emulateMedia({ colorScheme: scheme });
    await A.waitForTimeout(250);
    const c = await A.locator("[data-sel]").evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
    if (c[0] === c[1]) throw new Error(`selected number is invisible in ${scheme} mode: ${c}`);
  }
  await A.emulateMedia({ colorScheme: "light" });
  // personal events made before the feature was removed are not shown
  await owner.client.rpc("create_personal_event", { p_title: "昔の個人予定", p_starts_at: at(0, 20) });
  await A.reload();
  await A.getByRole("tab", { name: "タイムライン" }).click();
  await A.getByRole("link", { name: /朝練、/ }).waitFor();
  if (await A.getByText("昔の個人予定").count()) throw new Error("an old personal event is still shown");
});

await step("swiping a message to the left starts a reply (LINE-style)", async () => {
  const conv = (await admin.from("conversations").select("id").eq("group_id", groupId).single()).data.id;
  const sent = await member.client.rpc("send_message", { p_conversation_id: conv, p_client_id: crypto.randomUUID(), p_body: "サビのテンポ速くない？" });
  if (sent.error) throw new Error(sent.error.message);
  await A.goto(`${APP_URL}/talk/${conv}`);
  const msg = A.getByRole("log").getByText("サビのテンポ速くない？");
  await msg.waitFor();
  await A.waitForTimeout(400);
  const box = await msg.boundingBox();
  const y = box.y + box.height / 2;
  const cdp = await ctxA.newCDPSession(A);
  const t = (type, x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 0 }] });
  // a short drag snaps back without replying
  await t("touchStart", box.x + 40);
  for (let x = box.x + 40; x >= box.x + 10; x -= 6) await t("touchMove", x);
  await t("touchEnd", box.x + 10);
  await A.waitForTimeout(400);
  if (await A.getByText("伊藤 健に返信").count()) throw new Error("a short drag started a reply");
  // a long drag past the threshold opens reply mode
  await t("touchStart", box.x + 120);
  for (let x = box.x + 120; x >= box.x + 20; x -= 10) {
    await t("touchMove", x);
    if (x === box.x + 60 && shots) await shot(A, "d21-swipe-reply-drag");
  }
  await t("touchEnd", box.x + 20);
  await A.getByText("伊藤 健に返信").waitFor({ timeout: 3000 });
  await A.waitForTimeout(400);
  // the row's second child is the part that follows the finger
  const transform = await msg.evaluate((el) => el.closest("[id^='m-']").children[1].style.transform);
  if (transform) throw new Error(`message did not snap back: ${transform}`);
  await shot(A, "d22-swipe-reply-mode");
  await A.getByRole("button", { name: "キャンセル", exact: true }).click();
  // a mostly vertical drag (scrolling) over a message does not start a reply
  const v = (type, x, yy) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: yy, id: 0 }] });
  await v("touchStart", box.x + 100, y - 60);
  for (let i = 1; i <= 10; i++) await v("touchMove", box.x + 100 - i * 4, y - 60 + i * 14);
  await v("touchEnd", box.x + 60, y + 80);
  await A.waitForTimeout(400);
  if (await A.getByText("伊藤 健に返信").count()) throw new Error("a vertical drag started a reply");
});

await step("the year/month wheel jumps the calendar to the chosen month", async () => {
  await A.goto(`${APP_URL}/calendar`);
  await A.getByRole("button", { name: /^年月を選ぶ/ }).click();
  const dialog = A.getByRole("dialog");
  await dialog.getByRole("listbox", { name: "年" }).waitFor();
  await A.waitForTimeout(400);
  // scroll the wheels like a finger would: one year down, and to 3月
  await dialog.getByRole("listbox", { name: "年" }).evaluate((el) => el.scrollBy({ top: 44 }));
  await dialog.getByRole("listbox", { name: "月" }).evaluate((el) => el.scrollTo({ top: 2 * 44 }));
  await A.waitForTimeout(600);
  if ((await dialog.getByRole("option", { name: `${Y + 1}年`, selected: true }).count()) !== 1) throw new Error("year wheel did not select the next year");
  await shot(A, "d23-month-wheel");
  await dialog.getByRole("button", { name: `${Y + 1}年3月へ移動` }).click();
  await A.getByRole("heading", { level: 2, name: `${Y + 1}年3月` }).waitFor();
  await A.getByRole("button", { name: "今日" }).first().click();
  await A.getByRole("heading", { level: 2, name: `${Y}年${M + 1}月` }).waitFor();
});

let teamConv = "";
await step("パート・バンド: create one, its talk and events stay inside the team", async () => {
  await A.goto(`${APP_URL}/groups/${groupId}`);
  await A.getByRole("region", { name: "パート・バンド" }).getByRole("link", { name: "作成" }).click();
  await A.getByLabel("名前").fill("サックス");
  await shot(A, "d24-team-new");
  await A.getByRole("button", { name: "作成する" }).click();
  await A.waitForURL(/\/talk\/[0-9a-f-]{36}$/);
  teamConv = A.url().split("/").pop();
  await A.getByRole("heading", { level: 1, name: "サックス" }).waitFor();
  const teamId = (await admin.from("teams").select("id").eq("group_id", groupId).eq("name", "サックス").single()).data.id;
  // an event for the team, from the team page
  await A.goto(`${APP_URL}/groups/${groupId}/teams/${teamId}`);
  await A.getByRole("link", { name: "予定を追加" }).click();
  await A.getByText("「サックス」のメンバーだけに表示・通知されます。").waitFor();
  await A.getByLabel("タイトル").fill("サックスのパート練");
  await A.getByRole("button", { name: "予定を作成" }).click();
  await A.waitForURL(/\/calendar$/);
  await A.getByRole("tab", { name: "サックス" }).click();
  await A.getByText("サックスのパート練").first().waitFor();
  await shot(A, "d25-team-event-calendar");
  // the card went to the team talk
  const card = await admin.from("messages").select("conversation_id").eq("kind", "event").eq("body", "サックスのパート練").order("created_at", { ascending: false }).limit(1).single();
  if (card.data.conversation_id !== teamConv) throw new Error("event card was not posted to the team talk");
  // another group member sees the team exists, but not its talk or events
  await B.goto(`${APP_URL}/groups/${groupId}`);
  await B.getByRole("region", { name: "パート・バンド" }).getByRole("link", { name: /サックス/ }).waitFor();
  await B.goto(`${APP_URL}/calendar`);
  await B.getByRole("tab", { name: "タイムライン" }).click();
  await B.getByRole("link", { name: /朝練、/ }).waitFor();
  if (await B.getByText("サックスのパート練").count()) throw new Error("a non-member sees the team event");
  await B.goto(`${APP_URL}/talk`);
  await B.getByRole("link", { name: /軽音サークル/ }).first().waitFor();
  if (await B.getByRole("link", { name: /^サックス/ }).count()) throw new Error("a non-member sees the team talk");
});

await step("talk search finds old messages and 固定 pins one to the top", async () => {
  const conv = (await admin.from("conversations").select("id").eq("group_id", groupId).eq("kind", "group").single()).data.id;
  await A.goto(`${APP_URL}/talk/${conv}`);
  await A.getByRole("log").getByText("サビのテンポ速くない？").waitFor();
  await A.getByRole("button", { name: "トーク内を検索" }).click();
  await A.getByRole("searchbox", { name: "メッセージを検索" }).fill("テンポ");
  const result = A.getByRole("dialog", { name: "トーク内を検索" }).getByRole("button", { name: /サビのテンポ速くない/ });
  await result.waitFor();
  await A.getByRole("dialog", { name: "トーク内を検索" }).locator("mark", { hasText: "テンポ" }).waitFor();
  await shot(A, "d26-talk-search");
  await result.click();
  await A.getByRole("dialog", { name: "トーク内を検索" }).waitFor({ state: "detached" });
  // LIKE wildcards are matched literally
  await A.getByRole("button", { name: "トーク内を検索" }).click();
  await A.getByRole("searchbox", { name: "メッセージを検索" }).fill("%");
  await A.getByText("「%」に一致するメッセージはありません").waitFor();
  await A.getByRole("button", { name: "検索を閉じる" }).click();
  // 固定
  await A.getByRole("log").getByText("サビのテンポ速くない？").click({ button: "right" });
  await A.getByRole("button", { name: "トーク上部に固定" }).click();
  const banner = A.getByRole("button", { name: /^固定メッセージ: サビのテンポ速くない/ });
  await banner.waitFor();
  await shot(A, "d27-pinned-banner");
  // the other member sees it too (Realtime via the system message)
  await B.goto(`${APP_URL}/talk/${conv}`);
  await B.getByRole("button", { name: /^固定メッセージ: サビのテンポ速くない/ }).waitFor();
  await A.getByRole("button", { name: "固定を解除" }).click();
  await banner.waitFor({ state: "detached" });
  await B.getByRole("button", { name: /^固定メッセージ/ }).waitFor({ state: "detached", timeout: 8000 });
});

await step("the launch animation plays once per session and never blocks taps", async () => {
  const ctx = await browser.newContext({ ...iphone });
  const p = await ctx.newPage();
  await p.goto(`${APP_URL}/login`);
  const splash = p.locator(".jam-splash");
  if (!(await splash.isVisible())) throw new Error("splash not shown on first launch");
  if ((await splash.evaluate((el) => getComputedStyle(el).pointerEvents)) !== "none") throw new Error("splash would block taps");
  await p.waitForTimeout(2000);
  if (await splash.isVisible()) throw new Error("splash did not go away");
  await p.reload();
  if (await splash.isVisible()) throw new Error("splash replayed in the same session");
  await ctx.close();
});

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
