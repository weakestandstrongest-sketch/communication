// History paging and dark mode.
import { APP_URL, sessionCookies } from "./session.mjs";

export async function runPart3({ browser, B, C, member, member2, step, shot, admin }) {
  await step("older messages load in pages without duplicates or gaps", async () => {
    const { data: dm } = await member.client.rpc("get_or_create_direct", { p_user_id: member2.id });
    const base = Date.now() - 3 * 86400000;
    const rows = Array.from({ length: 130 }, (_, i) => ({
      conversation_id: dm,
      sender_id: i % 2 ? member.id : member2.id,
      client_id: crypto.randomUUID(),
      body: `履歴メッセージ #${i + 1}`,
      created_at: new Date(base + i * 60000).toISOString(),
    }));
    const { error } = await admin.from("messages").insert(rows);
    if (error) throw new Error(error.message);
    await B.goto(`${APP_URL}/talk/${dm}`);
    const log = B.getByRole("log");
    await log.getByText("履歴メッセージ #130", { exact: true }).waitFor();
    if (await log.getByText("履歴メッセージ #1", { exact: true }).count()) throw new Error("first page should not include the oldest message");
    for (let i = 0; i < 6 && !(await log.getByText("これより前のメッセージはありません").count()); i++) {
      const anchor = log.locator("[id^=m-]").first();
      const anchorId = await anchor.getAttribute("id");
      await log.evaluate((el) => el.scrollTo({ top: 0 }));
      await B.waitForTimeout(900);
      // The message that was at the top is still on screen (position preserved, no jump to top).
      const box = await B.locator(`#${anchorId}`).boundingBox();
      if (!box || box.y < -50) throw new Error(`scroll position jumped after loading older messages (${box?.y})`);
    }
    await log.getByText("履歴メッセージ #1", { exact: true }).waitFor();
    const texts = await log.locator("p").allInnerTexts();
    const nums = texts.map((t) => /^履歴メッセージ #(\d+)$/.exec(t)?.[1]).filter(Boolean).map(Number);
    if (nums.length !== 130) throw new Error(`expected 130 history messages, saw ${nums.length}`);
    if (nums.some((n, i) => n !== i + 1)) throw new Error("history out of order");
  });

  await step("dark mode renders with the dark palette", async () => {
    const ctx = await browser.newContext({ colorScheme: "dark", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
    await ctx.addCookies(sessionCookies(member2.session));
    const p = await ctx.newPage();
    await p.goto(APP_URL);
    await p.getByText("対応が必要").waitFor();
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (bg !== "rgb(0, 0, 0)") throw new Error(`unexpected dark background ${bg}`);
    await shot(p, "18-home-dark");
    await p.goto(`${APP_URL}/talk`);
    await p.getByRole("link", { name: /テニスサークル Ace/ }).first().click();
    await p.waitForTimeout(1200);
    await shot(p, "19-chat-dark");
    await ctx.close();
  });
  void C;
}
