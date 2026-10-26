import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createTestUser, must, type TestUser } from "./helpers";

// Verifies that realtime delivery respects membership (RLS on postgres_changes and the
// authorization policies on private broadcast channels).
let owner: TestUser;
let member: TestUser;
let outsider: TestUser;
let groupId: string;
let conversationId: string;
const channels: RealtimeChannel[] = [];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function subscribe(user: TestUser, name: string, setup: (ch: RealtimeChannel) => RealtimeChannel, opts?: { private?: boolean }) {
  return new Promise<{ channel: RealtimeChannel; status: string }>((resolve) => {
    const ch = setup(user.client.channel(name, { config: { private: opts?.private ?? false } }));
    channels.push(ch);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve({ channel: ch, status });
    });
  });
}

beforeAll(async () => {
  [owner, member, outsider] = await Promise.all([createTestUser("RtOwner"), createTestUser("RtMember"), createTestUser("RtOutsider")]);
  for (const u of [owner, member, outsider]) {
    const { data } = await u.client.auth.getSession();
    u.client.realtime.setAuth(data.session!.access_token);
  }
  groupId = await must(owner.client.rpc("create_group", { p_name: "リアルタイム部" }));
  const invite = await must(owner.client.from("group_invites").select("code").eq("group_id", groupId).single());
  await must(member.client.rpc("join_group", { p_code: invite.code }));
  conversationId = (await must(owner.client.from("conversations").select("id").eq("group_id", groupId).single())).id;
});

afterAll(async () => {
  for (const ch of channels) await ch.unsubscribe();
});

describe("realtime", () => {
  it("delivers message inserts only to conversation members", async () => {
    const got = { member: [] as string[], outsider: [] as string[] };
    await subscribe(member, "rt-member", (ch) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => got.member.push((p.new as { body: string }).body)),
    );
    await subscribe(outsider, "rt-outsider", (ch) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (p) => got.outsider.push((p.new as { body: string }).body)),
    );
    await wait(1000);
    await must(owner.client.rpc("send_message", { p_conversation_id: conversationId, p_client_id: crypto.randomUUID(), p_body: "リアルタイム確認" }));
    for (let i = 0; i < 30 && !got.member.includes("リアルタイム確認"); i++) await wait(200);
    expect(got.member).toContain("リアルタイム確認");
    await wait(800);
    expect(got.outsider).toHaveLength(0);
  });

  it("does not deliver group deletions or membership changes to outsiders", async () => {
    const outsiderEvents: unknown[] = [];
    await subscribe(outsider, "rt-outsider-del", (ch) =>
      ch
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "polls" }, (p) => outsiderEvents.push(p))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "polls" }, (p) => outsiderEvents.push(p))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_members" }, (p) => outsiderEvents.push(p))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "group_members" }, (p) => outsiderEvents.push(p)),
    );
    await wait(1000);
    const pollId = await must(owner.client.rpc("create_poll", { p_group_id: groupId, p_title: "削除予定", p_options: ["a", "b"] }));
    await must(owner.client.rpc("set_poll_closed", { p_poll_id: pollId, p_closed: true }));
    await owner.client.from("polls").delete().eq("id", pollId);
    await wait(1500);
    expect(outsiderEvents).toHaveLength(0);
  });

  it("only lets conversation members join the private typing channel", async () => {
    const memberJoin = await subscribe(member, `conv:${conversationId}`, (ch) => ch.on("broadcast", { event: "typing" }, () => undefined), { private: true });
    expect(memberJoin.status).toBe("SUBSCRIBED");
    const received: unknown[] = [];
    const outsiderJoin = await subscribe(
      outsider,
      `conv:${conversationId}`,
      (ch) => ch.on("broadcast", { event: "typing" }, (p) => received.push(p)),
      { private: true },
    );
    await memberJoin.channel.send({ type: "broadcast", event: "typing", payload: { user_id: member.id } });
    await wait(1000);
    expect(outsiderJoin.status).not.toBe("SUBSCRIBED");
    expect(received).toHaveLength(0);
  });
});
