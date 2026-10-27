import { beforeAll, describe, expect, it } from "vitest";
import { admin, createTestUser, must, sql, type TestUser } from "./helpers";

// 意見箱: anonymous posts and threads.
let owner: TestUser; // group owner (admin)
let alice: TestUser;
let bob: TestUser;
let outsider: TestUser;
let groupId: string;

beforeAll(async () => {
  [owner, alice, bob, outsider] = await Promise.all([createTestUser("FbOwner"), createTestUser("FbAlice"), createTestUser("FbBob"), createTestUser("FbOutsider")]);
  groupId = await must(owner.client.rpc("create_group", { p_name: "ジャズ研" }));
  const invite = await must(owner.client.from("group_invites").select("code").eq("group_id", groupId).single());
  await must(alice.client.rpc("join_group", { p_code: invite.code }));
  await must(bob.client.rpc("join_group", { p_code: invite.code }));
});

describe("anonymity", () => {
  it("never exposes who wrote a post, to members or admins", async () => {
    const id = await must(alice.client.rpc("create_feedback_post", { p_group_id: groupId, p_body: "Autumn Leaves のテンポが走りがち", p_topic: "Autumn Leaves" }));
    for (const viewer of [owner, bob]) {
      const rows = await must(viewer.client.from("feedback_posts").select("*").eq("id", id));
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0])).not.toContain("author_id");
      expect(JSON.stringify(rows[0])).not.toContain(alice.id);
      const feed = await must(viewer.client.rpc("list_feedback", { p_group_id: groupId }));
      expect(JSON.stringify(feed)).not.toContain(alice.id);
    }
    // direct access to the private tables is impossible through the API
    const direct = await alice.client.schema("private" as never).from("feedback_post_authors" as never).select("*");
    expect(direct.error).not.toBeNull();
    // only the author sees mine = true
    const mineFor = async (u: TestUser) => (await must(u.client.rpc("list_feedback", { p_group_id: groupId }))).find((p: { id: string }) => p.id === id).mine;
    expect(await mineFor(alice)).toBe(true);
    expect(await mineFor(bob)).toBe(false);
    expect(await mineFor(owner)).toBe(false);
  });

  it("gives each person a stable alias in a thread, and the original poster is スレ主 (0)", async () => {
    const id = await must(alice.client.rpc("create_feedback_post", { p_group_id: groupId, p_body: "ソロの順番を決めたい" }));
    await must(bob.client.rpc("create_feedback_reply", { p_post_id: id, p_body: "賛成です" }));
    await must(owner.client.rpc("create_feedback_reply", { p_post_id: id, p_body: "じゃあ次の練習で決めよう" }));
    await must(bob.client.rpc("create_feedback_reply", { p_post_id: id, p_body: "ありがとう" }));
    await must(alice.client.rpc("create_feedback_reply", { p_post_id: id, p_body: "助かります" }));
    const thread = await must(owner.client.rpc("get_feedback_thread", { p_post_id: id }));
    expect(thread.replies.map((r: { alias_no: number }) => r.alias_no)).toEqual([1, 2, 1, 0]);
    expect(thread.post.reply_count).toBe(4);
    expect(JSON.stringify(thread)).not.toMatch(new RegExp(`${alice.id}|${bob.id}|${owner.id}`));
    const bobView = await must(bob.client.rpc("get_feedback_thread", { p_post_id: id }));
    expect(bobView.replies.map((r: { mine: boolean }) => r.mine)).toEqual([true, false, true, false]);
  });

  it("notifies the post author about replies without naming the replier", async () => {
    const id = await must(alice.client.rpc("create_feedback_post", { p_group_id: groupId, p_body: "通知テスト" }));
    const reply = await must(bob.client.rpc("create_feedback_reply", { p_post_id: id, p_body: "返信です" }));
    const notes = await must(alice.client.from("notifications").select("kind, actor_id, push, link").eq("ref_id", reply));
    expect(notes).toEqual([{ kind: "feedback_reply", actor_id: null, push: true, link: `/groups/${groupId}/feedback/${id}` }]);
    // members are told about the new post, but never the author
    const others = await must(bob.client.from("notifications").select("kind, actor_id, push").eq("ref_id", id));
    expect(others).toEqual([{ kind: "feedback_new", actor_id: null, push: false }]);
    expect(await must(alice.client.from("notifications").select("id").eq("ref_id", id))).toHaveLength(0);
    // replying to your own post does not notify you
    const own = await must(alice.client.rpc("create_feedback_reply", { p_post_id: id, p_body: "自分で返信" }));
    expect(await must(alice.client.from("notifications").select("id").eq("ref_id", own))).toHaveLength(0);
  });
});

describe("permissions", () => {
  it("lets only group members read and post", async () => {
    const id = await must(alice.client.rpc("create_feedback_post", { p_group_id: groupId, p_body: "内部の話" }));
    expect(await must(outsider.client.from("feedback_posts").select("id").eq("id", id))).toHaveLength(0);
    expect((await outsider.client.rpc("list_feedback", { p_group_id: groupId })).error).not.toBeNull();
    expect((await outsider.client.rpc("create_feedback_post", { p_group_id: groupId, p_body: "x" })).error).not.toBeNull();
    expect((await outsider.client.rpc("create_feedback_reply", { p_post_id: id, p_body: "x" })).error).not.toBeNull();
    expect((await outsider.client.rpc("get_feedback_thread", { p_post_id: id })).error).not.toBeNull();
    expect((await outsider.client.rpc("toggle_feedback_like", { p_kind: "post", p_id: id })).error).not.toBeNull();
    // no direct writes
    expect((await alice.client.from("feedback_posts").insert({ group_id: groupId, body: "直接" })).error).not.toBeNull();
    expect((await alice.client.from("feedback_posts").update({ body: "改ざん" }).eq("id", id)).error).not.toBeNull();
    expect((await must(admin.from("feedback_posts").select("body").eq("id", id).single())).body).toBe("内部の話");
  });

  it("allows deleting your own post or reply, and admins can moderate, others cannot", async () => {
    const id = await must(alice.client.rpc("create_feedback_post", { p_group_id: groupId, p_body: "消したい投稿" }));
    const reply = await must(bob.client.rpc("create_feedback_reply", { p_post_id: id, p_body: "bobの返信" }));
    expect((await bob.client.rpc("delete_feedback", { p_kind: "post", p_id: id })).error).not.toBeNull();
    expect((await alice.client.rpc("delete_feedback", { p_kind: "reply", p_id: reply })).error).not.toBeNull();
    await must(owner.client.rpc("delete_feedback", { p_kind: "reply", p_id: reply })); // admin moderation
    expect((await must(owner.client.rpc("get_feedback_thread", { p_post_id: id }))).post.reply_count).toBe(0);
    await must(alice.client.rpc("delete_feedback", { p_kind: "post", p_id: id }));
    expect(await must(admin.from("feedback_posts").select("id").eq("id", id))).toHaveLength(0);
    expect(sql(`select count(*) from private.feedback_post_authors where post_id = '${id}'`)).toBe("0");
  });

  it("deleting a post deletes its replies and likes", async () => {
    const id = await must(alice.client.rpc("create_feedback_post", { p_group_id: groupId, p_body: "連鎖削除" }));
    const reply = await must(bob.client.rpc("create_feedback_reply", { p_post_id: id, p_body: "r" }));
    await must(owner.client.rpc("toggle_feedback_like", { p_kind: "reply", p_id: reply }));
    await must(owner.client.rpc("delete_feedback", { p_kind: "post", p_id: id }));
    expect(sql(`select count(*) from private.feedback_likes where target_id = '${reply}'`)).toBe("0");
    expect(await must(admin.from("feedback_replies").select("id").eq("post_id", id))).toHaveLength(0);
  });
});

describe("likes, topics and feed", () => {
  it("toggles likes and keeps counts anonymous", async () => {
    const id = await must(alice.client.rpc("create_feedback_post", { p_group_id: groupId, p_body: "いいねテスト" }));
    expect(await must(bob.client.rpc("toggle_feedback_like", { p_kind: "post", p_id: id }))).toBe(true);
    expect(await must(owner.client.rpc("toggle_feedback_like", { p_kind: "post", p_id: id }))).toBe(true);
    let t = await must(bob.client.rpc("get_feedback_thread", { p_post_id: id }));
    expect(t.post.like_count).toBe(2);
    expect(t.post.liked).toBe(true);
    expect(await must(bob.client.rpc("toggle_feedback_like", { p_kind: "post", p_id: id }))).toBe(false);
    t = await must(alice.client.rpc("get_feedback_thread", { p_post_id: id }));
    expect(t.post.like_count).toBe(1);
    expect(t.post.liked).toBe(false);
  });

  it("filters by topic, sorts by hot, pages, and rate-limits spam", async () => {
    const g = await must(owner.client.rpc("create_group", { p_name: "別バンド" }));
    const a = await must(owner.client.rpc("create_feedback_post", { p_group_id: g, p_body: "古い", p_topic: "Blue Bossa" }));
    const b = await must(owner.client.rpc("create_feedback_post", { p_group_id: g, p_body: "新しい", p_topic: "Take Five" }));
    await must(owner.client.rpc("create_feedback_post", { p_group_id: g, p_body: "話題なし" }));
    const topics = await must(owner.client.rpc("feedback_topics", { p_group_id: g }));
    expect(topics.map((x: { topic: string }) => x.topic).sort()).toEqual(["Blue Bossa", "Take Five"]);
    const filtered = await must(owner.client.rpc("list_feedback", { p_group_id: g, p_topic: "Take Five" }));
    expect(filtered.map((p: { id: string }) => p.id)).toEqual([b]);
    const all = await must(owner.client.rpc("list_feedback", { p_group_id: g }));
    expect(all).toHaveLength(3);
    const older = await must(owner.client.rpc("list_feedback", { p_group_id: g, p_before: all[0].created_at }));
    expect(older.length).toBe(2);
    await must(owner.client.rpc("toggle_feedback_like", { p_kind: "post", p_id: a }));
    const hot = await must(owner.client.rpc("list_feedback", { p_group_id: g, p_sort: "hot" }));
    expect(hot[0].id).toBe(a);
    // 10 posts per hour per person
    for (let i = 0; i < 7; i++) await must(owner.client.rpc("create_feedback_post", { p_group_id: g, p_body: `連投${i}` }));
    const { error } = await owner.client.rpc("create_feedback_post", { p_group_id: g, p_body: "11件目" });
    expect(error?.message).toContain("投稿しすぎ");
  });

  it("validates input", async () => {
    expect((await alice.client.rpc("create_feedback_post", { p_group_id: groupId, p_body: "   " })).error).not.toBeNull();
    expect((await alice.client.rpc("create_feedback_post", { p_group_id: groupId, p_body: "あ".repeat(601) })).error).not.toBeNull();
  });
});
