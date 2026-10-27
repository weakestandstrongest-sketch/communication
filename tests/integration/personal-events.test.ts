import { beforeAll, describe, expect, it } from "vitest";
import { admin, createTestUser, must, type TestUser } from "./helpers";

// 個人の予定: visible only to the creator.
let owner: TestUser; // group owner / admin
let alice: TestUser;
let groupId: string;
const startsAt = () => new Date(Date.now() + 86400000).toISOString();

beforeAll(async () => {
  [owner, alice] = await Promise.all([createTestUser("PeOwner"), createTestUser("PeAlice")]);
  groupId = await must(owner.client.rpc("create_group", { p_name: "個人予定部" }));
  const invite = await must(owner.client.from("group_invites").select("code").eq("group_id", groupId).single());
  await must(alice.client.rpc("join_group", { p_code: invite.code }));
});

describe("personal events", () => {
  it("are visible only to their owner, even to group mates and admins", async () => {
    const id = await must(alice.client.rpc("create_personal_event", { p_title: "歯医者", p_starts_at: startsAt(), p_location: "駅前クリニック" }));
    expect(await must(alice.client.from("events").select("id, group_id, personal_user_id, rsvp_enabled").eq("id", id))).toEqual([
      { id, group_id: null, personal_user_id: alice.id, rsvp_enabled: false },
    ]);
    expect(await must(owner.client.from("events").select("id").eq("id", id))).toHaveLength(0);
    expect(await must(owner.client.from("events").select("id").eq("title", "歯医者"))).toHaveLength(0);
    // group events are unaffected
    const groupEvent = await must(owner.client.rpc("create_event", { p_group_id: groupId, p_title: "全体練習", p_starts_at: startsAt(), p_post_to_chat: false }));
    expect(await must(alice.client.from("events").select("id").eq("id", groupEvent))).toHaveLength(1);
  });

  it("create no chat card, no notification and no attendance", async () => {
    const id = await must(alice.client.rpc("create_personal_event", { p_title: "バイト", p_starts_at: startsAt() }));
    expect(await must(admin.from("messages").select("id").eq("event_id", id))).toHaveLength(0);
    expect(await must(admin.from("notifications").select("id").eq("ref_id", id))).toHaveLength(0);
    expect((await alice.client.rpc("set_attendance", { p_event_id: id, p_status: "going" })).error).not.toBeNull();
    expect((await owner.client.rpc("share_to_chat", { p_kind: "event", p_id: id })).error).not.toBeNull();
    expect((await alice.client.rpc("share_to_chat", { p_kind: "event", p_id: id })).error).not.toBeNull();
  });

  it("can be edited and deleted by the owner only", async () => {
    const id = await must(alice.client.rpc("create_personal_event", { p_title: "旧タイトル", p_starts_at: startsAt() }));
    const args = (title: string) => ({
      p_event_id: id, p_title: title, p_starts_at: startsAt(), p_ends_at: null as never, p_all_day: false, p_location: "", p_description: "",
      p_category: "other" as const, p_rsvp_enabled: true, p_rsvp_deadline: null as never, p_attendance_visibility: "members",
    });
    expect((await owner.client.rpc("update_event", args("乗っ取り"))).error).not.toBeNull();
    await must(alice.client.rpc("update_event", args("新タイトル")));
    const row = await must(admin.from("events").select("title, rsvp_enabled, group_id").eq("id", id).single());
    expect(row).toEqual({ title: "新タイトル", rsvp_enabled: false, group_id: null }); // RSVP stays off
    await owner.client.from("events").delete().eq("id", id);
    expect(await must(admin.from("events").select("id").eq("id", id))).toHaveLength(1);
    await must(alice.client.from("events").delete().eq("id", id));
    expect(await must(admin.from("events").select("id").eq("id", id))).toHaveLength(0);
  });

  it("cannot be created or moved into a group through the table or other functions", async () => {
    expect((await alice.client.from("events").insert({ title: "直接", starts_at: startsAt(), personal_user_id: alice.id } as never)).error).not.toBeNull();
    const id = await must(alice.client.rpc("create_personal_event", { p_title: "個人", p_starts_at: startsAt() }));
    expect((await alice.client.from("events").update({ group_id: groupId }).eq("id", id)).error).not.toBeNull();
    expect((await owner.client.rpc("set_event_canceled", { p_event_id: id, p_canceled: true })).error).not.toBeNull();
    expect((await alice.client.rpc("set_event_canceled", { p_event_id: id, p_canceled: true })).error).not.toBeNull();
  });

  it("are not delivered to other users through Realtime-visible rows", async () => {
    const id = await must(alice.client.rpc("create_personal_event", { p_title: "秘密の予定", p_starts_at: startsAt() }));
    // RLS is what Realtime applies to postgres_changes: the owner cannot read the row
    expect(await must(owner.client.from("events").select("id").eq("id", id))).toHaveLength(0);
  });

  it("disappear when their owner's account is deleted, and keep group events intact", async () => {
    const temp = await createTestUser("PeTemp");
    const id = await must(temp.client.rpc("create_personal_event", { p_title: "消える予定", p_starts_at: startsAt() }));
    await admin.auth.admin.deleteUser(temp.id);
    expect(await must(admin.from("events").select("id").eq("id", id))).toHaveLength(0);
  });
});
