// End-to-end user journey across multiple signed-in members (real browser, real local backend).
// Usage: node tests/e2e/journey.mjs [screenshotDir]
// Requires: `supabase start` (local) and the app running at TEST_APP_URL (default http://localhost:3000).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { APP_URL, admin, createUser, signedInContext } from "./session.mjs";

// Uses the Playwright installed on the machine (not a project dependency).
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const shots = process.argv[2] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });

let passed = 0;
let failed = 0;
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    passed++;
    console.log(`✓ ${name} (${Date.now() - started}ms)`);
  } catch (e) {
    failed++;
    if (shots) {
      for (const [label, p] of Object.entries(globalThis.__pages ?? {})) {
        await p.screenshot({ path: path.join(shots, `fail-${failed}-${label}.png`) }).catch(() => undefined);
      }
    }
    console.log(`✗ ${name}\n    ${String(e?.message ?? e).split("\n").slice(0, 6).join("\n    ")}`);
  }
}
async function shot(page, name) {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: false });
}

const browser = await chromium.launch();
const iphone = devices["iPhone 13"];

const [owner, member, member2, outsider] = await Promise.all([
  createUser("佐藤 花子"),
  createUser("田中 太郎"),
  createUser("鈴木 一郎"),
  createUser("部外者"),
]);

const ownerCtx = await signedInContext(browser, owner, { ...iphone });
const memberCtx = await signedInContext(browser, member, { viewport: { width: 1280, height: 860 } });
const member2Ctx = await signedInContext(browser, member2, { ...iphone });
const outsiderCtx = await signedInContext(browser, outsider, { viewport: { width: 1280, height: 860 } });
const A = await ownerCtx.newPage();
const B = await memberCtx.newPage();
const C = await member2Ctx.newPage();
const X = await outsiderCtx.newPage();
const consoleErrors = [];
globalThis.__pages = { A, B, C, X };
for (const [label, p] of [["A", A], ["B", B], ["C", C], ["X", X]]) {
  p.on("pageerror", (e) => consoleErrors.push(`${label}: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && consoleErrors.push(`${label}: ${m.text()}`));
}

let groupId = "";
let inviteCode = "";
let conversationId = "";

await step("unauthenticated visitors are redirected to the login screen", async () => {
  const anon = await browser.newPage();
  await anon.goto(`${APP_URL}/polls`);
  await anon.waitForURL(/\/login\?next=%2Fpolls/);
  await anon.getByRole("button", { name: "Googleでログイン" }).waitFor();
  if (shots) await anon.screenshot({ path: path.join(shots, "00-login.png") });
  await anon.close();
});

await step("new user sees onboarding on the home screen", async () => {
  await A.goto(APP_URL);
  await A.getByText("Jamへようこそ").waitFor();
  await shot(A, "01-home-onboarding");
});

await step("owner creates a group and sees the invite sheet", async () => {
  await A.getByRole("link", { name: "グループを作成" }).click();
  await A.getByLabel("グループ名").fill("テニスサークル Ace");
  await A.getByLabel("説明（任意）").fill("毎週火・木 18時から練習しています");
  await A.getByRole("radio", { name: "青緑" }).click();
  await A.getByRole("button", { name: "作成する" }).click();
  await A.getByRole("dialog", { name: "メンバーを招待" }).waitFor();
  inviteCode = (await A.locator("p.font-mono").innerText()).trim();
  groupId = A.url().split("/groups/")[1].split("?")[0];
  if (!/^[A-Z0-9]{10}$/.test(inviteCode)) throw new Error(`unexpected invite code ${inviteCode}`);
  await shot(A, "02-invite-sheet");
  await A.getByRole("button", { name: "閉じる" }).click();
});

await step("members join through the invite link", async () => {
  for (const p of [B, C]) {
    await p.goto(`${APP_URL}/invite/${inviteCode}`);
    await p.getByText("テニスサークル Ace").first().waitFor();
    await p.getByRole("button", { name: "このグループに参加する" }).click();
    await p.waitForURL(new RegExp(`/groups/${groupId}`));
  }
  await shot(C, "03-group-joined");
  const { count } = await admin.from("group_members").select("*", { count: "exact", head: true }).eq("group_id", groupId);
  if (count !== 3) throw new Error(`expected 3 members, got ${count}`);
});

await step("an invalid invite code is rejected", async () => {
  await X.goto(`${APP_URL}/invite/ZZZZZZZZZZ`);
  await X.getByText("招待が見つかりません").waitFor();
});

await step("members see the group chat in the talk list", async () => {
  const { data } = await admin.from("conversations").select("id").eq("group_id", groupId).single();
  conversationId = data.id;
  await B.goto(`${APP_URL}/talk`);
  await B.getByRole("link", { name: /テニスサークル Ace/ }).first().waitFor();
});

await step("messages are delivered in real time and unread counts update", async () => {
  await B.goto(`${APP_URL}/talk/${conversationId}`);
  await B.getByLabel("メッセージ", { exact: true }).waitFor();
  await C.goto(`${APP_URL}/talk`);
  await C.getByRole("link", { name: /テニスサークル Ace/ }).first().waitFor();
  await A.goto(`${APP_URL}/talk/${conversationId}`);
  const box = A.getByLabel("メッセージ", { exact: true });
  await box.fill("こんにちは！今週の練習は木曜18時からです🎾");
  await A.getByRole("button", { name: "送信" }).click();
  // B (viewing the conversation) receives it without reloading.
  await B.getByRole("log").getByText("こんにちは！今週の練習は木曜18時からです🎾").waitFor({ timeout: 8000 });
  // C (on the list) sees the unread badge.
  await C.getByRole("link", { name: /テニスサークル Ace、未読1件/ }).waitFor({ timeout: 8000 });
  await shot(C, "04-talk-list-unread");
  await B.getByLabel("メッセージ", { exact: true }).fill("了解です！ラケット持っていきます");
  await B.getByLabel("メッセージ", { exact: true }).press("Enter");
  await A.getByRole("log").getByText("了解です！ラケット持っていきます").waitFor({ timeout: 8000 });
  // Read receipt for A's message once B has it open.
  await A.getByText(/既読 1/).first().waitFor({ timeout: 8000 });
  await shot(A, "05-chat-iphone");
  if (shots) await B.screenshot({ path: path.join(shots, "06-chat-desktop.png") });
});

await step("long Japanese text and a burst of messages keep their order", async () => {
  const burst = Array.from({ length: 5 }, (_, i) => `連投テスト ${i + 1}`);
  for (const text of burst) {
    await B.getByLabel("メッセージ", { exact: true }).fill(text);
    await B.getByLabel("メッセージ", { exact: true }).press("Enter");
  }
  const long = "長文テスト。".repeat(80);
  await B.getByLabel("メッセージ", { exact: true }).fill(long);
  await B.getByLabel("メッセージ", { exact: true }).press("Enter");
  await A.getByRole("log").getByText("連投テスト 5").waitFor({ timeout: 8000 });
  const texts = await A.locator("[role=log] p").allInnerTexts();
  const order = burst.map((t) => texts.findIndex((x) => x.includes(t)));
  if (order.some((v, i) => v < 0 || (i > 0 && v <= order[i - 1]))) throw new Error(`order broken: ${order}`);
  const { count } = await admin.from("messages").select("*", { count: "exact", head: true }).eq("conversation_id", conversationId).like("body", "連投テスト%");
  if (count !== 5) throw new Error(`expected 5 stored burst messages, got ${count}`);
});

await step("opening the conversation clears the unread badge", async () => {
  await C.getByRole("link", { name: /テニスサークル Ace/ }).first().click();
  await C.getByRole("log").getByText("了解です！ラケット持っていきます").waitFor();
  await C.waitForTimeout(1000);
  await C.goto(`${APP_URL}/talk`);
  await C.waitForTimeout(800);
  const unread = await C.getByRole("link", { name: /テニスサークル Ace、未読/ }).count();
  if (unread !== 0) throw new Error("unread badge still visible");
});


if (process.env.JOURNEY_PART !== "1-only") {
  const { runPart2 } = await import("./journey-part2.mjs");
  await runPart2({ browser, A, B, C, X, owner, member, member2, outsider, step, shot, groupId, conversationId, admin });
  const { runPart3 } = await import("./journey-part3.mjs");
  await runPart3({ browser, B, C, member, member2, step, shot, admin });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (consoleErrors.length) {
  console.log(`\nBrowser console errors (${consoleErrors.length}):`);
  for (const e of [...new Set(consoleErrors)].slice(0, 20)) console.log("  " + e.slice(0, 300));
}
await browser.close();
process.exit(failed ? 1 : 0);
