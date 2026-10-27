import { beforeAll, describe, expect, it } from "vitest";
import { admin, createTestUser, must, type TestUser } from "./helpers";

// パート・バンド (teams) and pinned messages.
let owner: TestUser; // group owner (admin)
let sax: TestUser; // team member
let drums: TestUser; // group member, not in the team
let outsider: TestUser;
let groupId: string;
let teamId: string;
let teamConv: string;
const startsAt = () => new Date(Date.now() + 2 * 86400000).toISOString();

beforeAll(async () => {
  [owner, sax, drums, outsider] = await Promise.all([
    createTestUser("TmOwner"),
    createTestUser("TmSax"),
    createTestUser("TmDrums"),
    createTestUser("TmOutsider"),
  ]);
  groupId = await must(owner.client.rpc("create_group", { p_name: "軽音部" }));
  const invite = await must(owner.client.from("group_invites").select("code").eq("group_id", groupId).single());
  await must(sax.client.rpc("join_group", { p_code: invite.code }));
  await must(drums.client.rpc("join_group", { p_code: invite.code }));
});

describe("teams", () => {
  it("are created with group members only and get their own talk room", async () => {
    // The outsider is not in the group, so they are ignored.
    teamId = await must(sax.client.rpc("create_team", { p_group_id: groupId, p_name: "サックス", p_member_ids: [outsider.id] }));
    expect((await must(admin.from("team_members").select("user_id").eq("team_id", teamId))).map((r: { user_id: string }) => r.user_id)).toEqual([sax.id]);
    await must(sax.client.rpc("add_team_members", { p_team_id: teamId, p_user_ids: [owner.id, outsider.id] }));
    const members = (await must(admin.from("team_members").select("user_id").eq("team_id", teamId))).map((r: { user_id: string }) => r.user_id).sort();
    expect(members).toEqual([owner.id, sax.id].sort());
    teamConv = (await must(admin.from("conversations").select("id").eq("team_id", teamId).single())).id;
    const convMembers = (await must(admin.from("conversation_members").select("user_id").eq("conversation_id", teamConv))).map((r: { user_id: string }) => r.user_id).sort();
    expect(convMembers).toEqual(members);
    // the talk list shows the room with its team name
    const list = await must(sax.client.rpc("get_conversations"));
    expect(list.find((c: { id: string }) => c.id === teamConv)).toMatchObject({ kind: "team", team_name: "サックス", group_name: "軽音部" });
  });

  it("only team members can read the team talk; outsiders cannot create teams", async () => {
    await must(sax.client.rpc("send_message", { p_conversation_id: teamConv, p_client_id: crypto.randomUUID(), p_body: "パート練の連絡" }));
    expect(await must(owner.client.from("messages").select("id").eq("conversation_id", teamConv).eq("body", "パート練の連絡"))).toHaveLength(1);
    expect(await must(drums.client.from("messages").select("id").eq("conversation_id", teamConv))).toHaveLength(0);
    expect((await drums.client.rpc("send_message", { p_conversation_id: teamConv, p_client_id: crypto.randomUUID(), p_body: "x" })).error).not.toBeNull();
    // the team itself is visible to the group (like a member list), not to outsiders
    expect(await must(drums.client.from("teams").select("id").eq("id", teamId))).toHaveLength(1);
    expect(await must(outsider.client.from("teams").select("id").eq("id", teamId))).toHaveLength(0);
    expect((await outsider.client.rpc("create_team", { p_group_id: groupId, p_name: "侵入" })).error).not.toBeNull();
    // tables are not writable directly
    expect((await drums.client.from("team_members").insert({ team_id: teamId, group_id: groupId, user_id: drums.id } as never)).error).not.toBeNull();
  });

  it("team events are visible, notified and counted for team members only", async () => {
    const eventId = await must(
      sax.client.rpc("create_event", { p_group_id: groupId, p_team_id: teamId, p_title: "パート練", p_starts_at: startsAt() }),
    );
    expect(await must(owner.client.from("events").select("id").eq("id", eventId))).toHaveLength(1);
    expect(await must(drums.client.from("events").select("id").eq("id", eventId))).toHaveLength(0);
    // the card goes to the team talk, not the group talk
    const cards = await must(admin.from("messages").select("conversation_id").eq("event_id", eventId));
    expect(cards.map((c: { conversation_id: string }) => c.conversation_id)).toEqual([teamConv]);
    // notifications reach team members (not the actor), never the rest of the group
    const notified = (await must(admin.from("notifications").select("user_id").eq("ref_id", eventId))).map((r: { user_id: string }) => r.user_id);
    expect(notified).toEqual([owner.id]);
    // attendance
    expect((await drums.client.rpc("set_attendance", { p_event_id: eventId, p_status: "going" })).error).not.toBeNull();
    expect((await drums.client.rpc("get_event_attendance", { p_event_id: eventId })).error).not.toBeNull();
    expect((await drums.client.rpc("share_to_chat", { p_kind: "event", p_id: eventId })).error).not.toBeNull();
    await must(owner.client.rpc("set_attendance", { p_event_id: eventId, p_status: "going" }));
    const att = (await must(sax.client.rpc("get_event_attendance", { p_event_id: eventId }))) as { member_count: number; non_respondents: string[] };
    expect(att.member_count).toBe(2);
    expect(att.non_respondents).toEqual([sax.id]);
    expect(await must(drums.client.from("event_attendance").select("user_id").eq("event_id", eventId))).toHaveLength(0);
    // a non-member can't add events to the team
    expect((await drums.client.rpc("create_event", { p_group_id: groupId, p_team_id: teamId, p_title: "x", p_starts_at: startsAt() })).error).not.toBeNull();
    // changes notify the team only
    await must(sax.client.rpc("set_event_canceled", { p_event_id: eventId, p_canceled: true }));
    const canceled = (await must(admin.from("notifications").select("user_id").eq("ref_id", eventId).eq("kind", "event_canceled"))).map((r: { user_id: string }) => r.user_id);
    expect(canceled).toEqual([owner.id]);
  });

  it("members can leave; only the creator or an admin can remove others or delete the team", async () => {
    await must(owner.client.rpc("add_team_members", { p_team_id: teamId, p_user_ids: [drums.id] }));
    expect((await drums.client.rpc("remove_team_member", { p_team_id: teamId, p_user_id: sax.id })).error).not.toBeNull();
    await must(drums.client.rpc("remove_team_member", { p_team_id: teamId, p_user_id: drums.id }));
    expect(await must(admin.from("conversation_members").select("user_id").eq("conversation_id", teamConv).eq("user_id", drums.id))).toHaveLength(0);
    expect((await drums.client.rpc("delete_team", { p_team_id: teamId })).error).not.toBeNull();
    // leaving the group removes the person from its teams and their talk rooms
    const other = await must(sax.client.rpc("create_team", { p_group_id: groupId, p_name: "ドラム", p_member_ids: [drums.id] }));
    const otherConv = (await must(admin.from("conversations").select("id").eq("team_id", other).single())).id;
    await must(drums.client.rpc("leave_group", { p_group_id: groupId }));
    expect(await must(admin.from("team_members").select("user_id").eq("team_id", other).eq("user_id", drums.id))).toHaveLength(0);
    expect(await must(admin.from("conversation_members").select("user_id").eq("conversation_id", otherConv).eq("user_id", drums.id))).toHaveLength(0);
    // the group owner (admin) can delete a team; its room and events go with it
    await must(owner.client.rpc("delete_team", { p_team_id: other }));
    expect(await must(admin.from("conversations").select("id").eq("id", otherConv))).toHaveLength(0);
  });
});

describe("pinned messages", () => {
  it("any member pins one message; it shows in the talk list and is cleared when deleted", async () => {
    const msg = await must(sax.client.rpc("send_message", { p_conversation_id: teamConv, p_client_id: crypto.randomUUID(), p_body: "本番は18時集合" }));
    const msgId = (msg as { id: string }).id;
    expect((await drums.client.rpc("set_pinned_message", { p_conversation_id: teamConv, p_message_id: msgId })).error).not.toBeNull();
    await must(owner.client.rpc("set_pinned_message", { p_conversation_id: teamConv, p_message_id: msgId }));
    const row = (await must(sax.client.rpc("get_conversations"))).find((c: { id: string }) => c.id === teamConv);
    expect(row?.pinned_message_id).toBe(msgId);
    // a system message announces it
    expect(await must(admin.from("messages").select("id").eq("conversation_id", teamConv).eq("kind", "system").like("body", "%固定しました"))).toHaveLength(1);
    // only messages of this talk can be pinned
    const groupConv = (await must(admin.from("conversations").select("id").eq("group_id", groupId).eq("kind", "group").single())).id;
    expect((await owner.client.rpc("set_pinned_message", { p_conversation_id: groupConv, p_message_id: msgId })).error).not.toBeNull();
    await must(sax.client.rpc("delete_message", { p_message_id: msgId }));
    expect((await must(admin.from("conversations").select("pinned_message_id").eq("id", teamConv).single())).pinned_message_id).toBeNull();
  });

  it("can be unpinned", async () => {
    const msg = (await must(sax.client.rpc("send_message", { p_conversation_id: teamConv, p_client_id: crypto.randomUUID(), p_body: "譜面" }))) as { id: string };
    await must(sax.client.rpc("set_pinned_message", { p_conversation_id: teamConv, p_message_id: msg.id }));
    await must(owner.client.rpc("set_pinned_message", { p_conversation_id: teamConv, p_message_id: null as never }));
    expect((await must(admin.from("conversations").select("pinned_message_id").eq("id", teamConv).single())).pinned_message_id).toBeNull();
  });
});
