import { beforeAll, describe, expect, it } from "vitest";
import { admin, createTestUser, must, type TestUser } from "./helpers";

// Deleting a talk for yourself (LINE-style): only your own view changes.
let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
let groupId: string;
let dm: string;
const say = (u: TestUser, conv: string, body: string) =>
  must(u.client.rpc("send_message", { p_conversation_id: conv, p_client_id: crypto.randomUUID(), p_body: body }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const listIds = async (u: TestUser) => (await must(u.client.rpc("get_conversations"))).map((c: { id: string }) => c.id);

beforeAll(async () => {
  [alice, bob, carol] = await Promise.all([createTestUser("ClAlice"), createTestUser("ClBob"), createTestUser("ClCarol")]);
  groupId = await must(alice.client.rpc("create_group", { p_name: "削除部" }));
  const invite = await must(alice.client.from("group_invites").select("code").eq("group_id", groupId).single());
  await must(bob.client.rpc("join_group", { p_code: invite.code }));
  await must(carol.client.rpc("join_group", { p_code: invite.code }));
  dm = await must(alice.client.rpc("get_or_create_direct", { p_user_id: bob.id }));
});

describe("clear_conversation", () => {
  it("hides an empty 1:1 room from the person who deleted it (and only them)", async () => {
    expect(await listIds(alice)).toContain(dm);
    await must(alice.client.rpc("clear_conversation", { p_conversation_id: dm }));
    expect(await listIds(alice)).not.toContain(dm);
    expect(await listIds(bob)).toContain(dm);
  });

  it("brings the room back when a message arrives, showing only the new messages", async () => {
    await say(bob, dm, "もしもし");
    expect(await listIds(alice)).toContain(dm);
    expect(await must(alice.client.from("messages").select("body").eq("conversation_id", dm))).toEqual([{ body: "もしもし" }]);
    const row = (await must(alice.client.rpc("get_conversations"))).find((c: { id: string }) => c.id === dm);
    expect(row).toMatchObject({ last_message_body: "もしもし", unread_count: 1 });
  });

  it("clears history only for the one who deleted; the other still sees everything", async () => {
    await say(alice, dm, "古い話");
    await wait(30);
    await must(alice.client.rpc("clear_conversation", { p_conversation_id: dm }));
    expect(await listIds(alice)).not.toContain(dm);
    expect(await must(alice.client.from("messages").select("id").eq("conversation_id", dm))).toHaveLength(0);
    expect(await must(bob.client.from("messages").select("id").eq("conversation_id", dm))).toHaveLength(2);
    // a new message from the other side only shows what came after
    await wait(30);
    await say(bob, dm, "新しい話");
    expect((await must(alice.client.from("messages").select("body").eq("conversation_id", dm))).map((m: { body: string }) => m.body)).toEqual(["新しい話"]);
    const row = (await must(alice.client.rpc("get_conversations"))).find((c: { id: string }) => c.id === dm);
    expect(row.unread_count).toBe(1);
  });

  it("opening the talk again from the member list brings the room back, still without the old history", async () => {
    await must(alice.client.rpc("clear_conversation", { p_conversation_id: dm }));
    expect(await listIds(alice)).not.toContain(dm);
    expect(await must(alice.client.rpc("get_or_create_direct", { p_user_id: bob.id }))).toBe(dm);
    expect(await listIds(alice)).toContain(dm);
    expect(await must(alice.client.from("messages").select("id").eq("conversation_id", dm))).toHaveLength(0);
    await say(alice, dm, "また話そう");
    expect(await must(alice.client.from("messages").select("id").eq("conversation_id", dm))).toHaveLength(1);
  });

  it("clearing a group talk empties it for you only and keeps the room", async () => {
    const groupConv = (await must(admin.from("conversations").select("id").eq("group_id", groupId).eq("kind", "group").single())).id;
    await say(bob, groupConv, "合宿の件");
    await wait(30);
    await must(alice.client.rpc("clear_conversation", { p_conversation_id: groupConv }));
    expect(await listIds(alice)).toContain(groupConv); // the room stays, tied to the group
    expect(await must(alice.client.from("messages").select("id").eq("conversation_id", groupConv).eq("body", "合宿の件"))).toHaveLength(0);
    expect(await must(carol.client.from("messages").select("id").eq("conversation_id", groupConv).eq("body", "合宿の件"))).toHaveLength(1);
    const row = (await must(alice.client.rpc("get_conversations"))).find((c: { id: string }) => c.id === groupConv);
    expect(row).toMatchObject({ unread_count: 0, last_message_body: null });
    await wait(30);
    await say(bob, groupConv, "新しい連絡");
    expect((await must(alice.client.from("messages").select("body").eq("conversation_id", groupConv).eq("kind", "text"))).map((m: { body: string }) => m.body)).toEqual(["新しい連絡"]);
  });

  it("only members can clear a talk", async () => {
    expect((await carol.client.rpc("clear_conversation", { p_conversation_id: dm })).error).not.toBeNull();
    expect(await listIds(bob)).toContain(dm);
  });
});
