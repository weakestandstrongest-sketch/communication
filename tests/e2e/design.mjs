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
  const box = await grid.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const touch = async (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  // spread fingers apart
  await touch("touchStart", [[cx - 30, cy], [cx + 30, cy]]);
  for (let d = 30; d <= 45; d += 5) await touch("touchMove", [[cx - d, cy], [cx + d, cy]]);
  await touch("touchEnd", []);
  await A.waitForTimeout(300);
  if ((await grid.getAttribute("data-zoom")) !== "1") throw new Error(`pinch-out should zoom in, got ${await grid.getAttribute("data-zoom")}`);
  // pinch together
  await touch("touchStart", [[cx - 110, cy], [cx + 110, cy]]);
  for (let d = 110; d >= 20; d -= 10) await touch("touchMove", [[cx - d, cy], [cx + d, cy]]);
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

console.log(`\n${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
