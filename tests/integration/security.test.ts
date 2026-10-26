import { beforeAll, describe, expect, it } from "vitest";
import { admin, createTestUser, must, sql, type TestUser } from "./helpers";

// Exercises the database rules with real authenticated users against the local stack.
let owner: TestUser;
let member: TestUser;
let member2: TestUser;
let outsider: TestUser;
let groupId: string;
let conversationId: string;
let inviteCode: string;

beforeAll(async () => {
  [owner, member, member2, outsider] = await Promise.all([
    createTestUser("Owner"),
    createTestUser("Member"),
    createTestUser("Member2"),
    createTestUser("Outsider"),
  ]);
  groupId = await must(owner.client.rpc("create_group", { p_name: "テスト部", p_description: "テスト用" }));
  const invite = await must(owner.client.from("group_invites").select("code").eq("group_id", groupId).single());
  inviteCode = invite.code;
  await must(member.client.rpc("join_group", { p_code: inviteCode }));
  await must(member2.client.rpc("join_group", { p_code: inviteCode.toLowerCase() }));
  const conv = await must(
    owner.client.from("conversations").select("id").eq("group_id", groupId).eq("kind", "group").single(),
  );
  conversationId = conv.id;
});

describe("profiles", () => {
  it("creates a profile from Google metadata on sign-up", async () => {
    const p = await must(owner.client.from("profiles").select("*").eq("id", owner.id).single());
    expect(p.display_name).toBe("Owner");
    expect(p.avatar_url).toContain("Owner.png");
  });

  it("hides profiles of users who share no group", async () => {
    const rows = await must(outsider.client.from("profiles").select("id").eq("id", owner.id));
    expect(rows).toHaveLength(0);
  });

  it("does not let a user edit someone else's profile", async () => {
    await outsider.client.from("profiles").update({ display_name: "hacked" }).eq("id", owner.id);
    const p = await must(admin.from("profiles").select("display_name").eq("id", owner.id).single());
    expect(p.display_name).toBe("Owner");
  });
});

describe("groups and membership", () => {
  it("lets members read the group but not outsiders", async () => {
    expect(await must(member.client.from("groups").select("id").eq("id", groupId))).toHaveLength(1);
    expect(await must(outsider.client.from("groups").select("id").eq("id", groupId))).toHaveLength(0);
    expect(await must(outsider.client.from("group_members").select("user_id").eq("group_id", groupId))).toHaveLength(0);
  });

  it("previews only valid invite codes", async () => {
    const ok = await must(outsider.client.rpc("preview_invite", { p_code: inviteCode }));
    expect(ok[0].name).toBe("テスト部");
    expect(ok[0].member_count).toBe(3);
    const bad = await must(outsider.client.rpc("preview_invite", { p_code: "NOPE1234" }));
    expect(bad).toHaveLength(0);
    const { error } = await outsider.client.rpc("join_group", { p_code: "NOPE1234" });
    expect(error).not.toBeNull();
  });

  it("prevents members from changing roles or editing membership directly", async () => {
    const { error } = await member.client.rpc("set_member_role", {
      p_group_id: groupId,
      p_user_id: member.id,
      p_role: "owner",
    });
    expect(error).not.toBeNull();
    await member.client.from("group_members").update({ role: "owner" }).eq("group_id", groupId).eq("user_id", member.id);
    const { error: insertError } = await outsider.client
      .from("group_members")
      .insert({ group_id: groupId, user_id: outsider.id, role: "member" });
    expect(insertError).not.toBeNull();
    const row = await must(
      admin.from("group_members").select("role").eq("group_id", groupId).eq("user_id", member.id).single(),
    );
    expect(row.role).toBe("member");
  });

  it("prevents members from editing group settings", async () => {
    await member.client.from("groups").update({ name: "乗っ取り" }).eq("id", groupId);
    const g = await must(admin.from("groups").select("name").eq("id", groupId).single());
    expect(g.name).toBe("テスト部");
  });

  it("lets the owner promote an admin, and admins cannot remove other admins", async () => {
    await must(owner.client.rpc("set_member_role", { p_group_id: groupId, p_user_id: member.id, p_role: "admin" }));
    const tmp = await createTestUser("Temp");
    await must(tmp.client.rpc("join_group", { p_code: inviteCode }));
    await must(owner.client.rpc("set_member_role", { p_group_id: groupId, p_user_id: tmp.id, p_role: "admin" }));
    const { error } = await member.client.rpc("remove_member", { p_group_id: groupId, p_user_id: tmp.id });
    expect(error).not.toBeNull();
    const { error: ownerErr } = await member.client.rpc("remove_member", { p_group_id: groupId, p_user_id: owner.id });
    expect(ownerErr).not.toBeNull();
    await must(owner.client.rpc("remove_member", { p_group_id: groupId, p_user_id: tmp.id }));
    expect(await must(tmp.client.from("groups").select("id").eq("id", groupId))).toHaveLength(0);
    expect(await must(tmp.client.from("messages").select("id").eq("conversation_id", conversationId))).toHaveLength(0);
    await must(owner.client.rpc("set_member_role", { p_group_id: groupId, p_user_id: member.id, p_role: "member" }));
  });

  it("hides the invite code from members when member invites are disabled", async () => {
    await must(owner.client.from("groups").update({ member_can_invite: false }).eq("id", groupId));
    expect(await must(member.client.from("group_invites").select("code").eq("group_id", groupId))).toHaveLength(0);
    await must(owner.client.from("groups").update({ member_can_invite: true }).eq("id", groupId));
    expect(await must(member.client.from("group_invites").select("code").eq("group_id", groupId))).toHaveLength(1);
  });
});

describe("messages", () => {
  it("sends idempotently and tracks unread counts", async () => {
    const clientId = crypto.randomUUID();
    const first = await must(
      owner.client.rpc("send_message", { p_conversation_id: conversationId, p_client_id: clientId, p_body: "こんにちは👋" }),
    );
    const retry = await must(
      owner.client.rpc("send_message", { p_conversation_id: conversationId, p_client_id: clientId, p_body: "こんにちは👋" }),
    );
    expect(retry.id).toBe(first.id);
    const count = await must(
      admin.from("messages").select("id", { count: "exact", head: false }).eq("sender_id", owner.id).eq("client_id", clientId),
    );
    expect(count).toHaveLength(1);

    const convs = await must(member.client.rpc("get_conversations"));
    const c = convs.find((x: { id: string }) => x.id === conversationId);
    expect(c.unread_count).toBeGreaterThanOrEqual(1);
    expect(c.last_message_body).toBe("こんにちは👋");

    await must(member.client.rpc("mark_conversation_read", { p_conversation_id: conversationId }));
    const after = await must(member.client.rpc("get_conversations"));
    expect(after.find((x: { id: string }) => x.id === conversationId).unread_count).toBe(0);
    // Own messages never count as unread.
    const own = await must(owner.client.rpc("get_conversations"));
    expect(own.find((x: { id: string }) => x.id === conversationId).unread_count).toBe(0);
  });

  it("blocks outsiders from reading or posting", async () => {
    expect(await must(outsider.client.from("messages").select("id").eq("conversation_id", conversationId))).toHaveLength(0);
    const { error } = await outsider.client.rpc("send_message", {
      p_conversation_id: conversationId,
      p_client_id: crypto.randomUUID(),
      p_body: "spam",
    });
    expect(error).not.toBeNull();
    const { error: directErr } = await outsider.client
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: outsider.id, client_id: crypto.randomUUID(), body: "x" });
    expect(directErr).not.toBeNull();
  });

  it("allows editing only by the sender and deletion by sender or admin", async () => {
    const msg = await must(
      member.client.rpc("send_message", { p_conversation_id: conversationId, p_client_id: crypto.randomUUID(), p_body: "編集前" }),
    );
    const { error: e1 } = await member2.client.rpc("edit_message", { p_message_id: msg.id, p_body: "改ざん" });
    expect(e1).not.toBeNull();
    const edited = await must(member.client.rpc("edit_message", { p_message_id: msg.id, p_body: "編集後" }));
    expect(edited.body).toBe("編集後");
    expect(edited.edited_at).not.toBeNull();
    const { error: e2 } = await member2.client.rpc("delete_message", { p_message_id: msg.id });
    expect(e2).not.toBeNull();
    await must(owner.client.rpc("delete_message", { p_message_id: msg.id }));
    const row = await must(admin.from("messages").select("body, deleted_at").eq("id", msg.id).single());
    expect(row.body).toBe("");
    expect(row.deleted_at).not.toBeNull();
  });

  it("aggregates reactions on the message", async () => {
    const msg = await must(
      owner.client.rpc("send_message", { p_conversation_id: conversationId, p_client_id: crypto.randomUUID(), p_body: "リアクションして" }),
    );
    expect(await must(member.client.rpc("toggle_reaction", { p_message_id: msg.id, p_emoji: "👍" }))).toBe(true);
    await must(member2.client.rpc("toggle_reaction", { p_message_id: msg.id, p_emoji: "👍" }));
    let row = await must(member.client.from("messages").select("reactions").eq("id", msg.id).single());
    expect(row.reactions["👍"]).toEqual([member.id, member2.id]);
    expect(await must(member.client.rpc("toggle_reaction", { p_message_id: msg.id, p_emoji: "👍" }))).toBe(false);
    row = await must(member.client.from("messages").select("reactions").eq("id", msg.id).single());
    expect(row.reactions["👍"]).toEqual([member2.id]);
    const { error } = await outsider.client.rpc("toggle_reaction", { p_message_id: msg.id, p_emoji: "👎" });
    expect(error).not.toBeNull();
  });

  it("creates mention and reply notifications only for the right people", async () => {
    const parent = await must(
      member.client.rpc("send_message", { p_conversation_id: conversationId, p_client_id: crypto.randomUUID(), p_body: "質問です" }),
    );
    const reply = await must(
      owner.client.rpc("send_message", {
        p_conversation_id: conversationId,
        p_client_id: crypto.randomUUID(),
        p_body: "@Member2 さんも見てください",
        p_reply_to_id: parent.id,
        p_mentions: [member2.id, outsider.id],
      }),
    );
    expect(reply.mentions).toEqual([member2.id]);
    const n1 = await must(member.client.from("notifications").select("kind").eq("ref_id", reply.id));
    expect(n1.map((n: { kind: string }) => n.kind)).toEqual(["reply"]);
    const n2 = await must(member2.client.from("notifications").select("kind").eq("ref_id", reply.id));
    expect(n2.map((n: { kind: string }) => n.kind)).toEqual(["mention"]);
    const n3 = await must(owner.client.from("notifications").select("kind").eq("ref_id", reply.id));
    expect(n3).toHaveLength(0);
  });

  it("only allows direct messages between members of a shared group", async () => {
    const { error } = await outsider.client.rpc("get_or_create_direct", { p_user_id: owner.id });
    expect(error).not.toBeNull();
    const dm = await must(member.client.rpc("get_or_create_direct", { p_user_id: member2.id }));
    const again = await must(member2.client.rpc("get_or_create_direct", { p_user_id: member.id }));
    expect(again).toBe(dm);
    await must(member.client.rpc("send_message", { p_conversation_id: dm, p_client_id: crypto.randomUUID(), p_body: "DM" }));
    expect(await must(owner.client.from("messages").select("id").eq("conversation_id", dm))).toHaveLength(0);
    expect(await must(member2.client.from("messages").select("id").eq("conversation_id", dm))).toHaveLength(1);
  });
});

describe("polls", () => {
  it("publishes a card and notifies other members", async () => {
    const pollId = await must(
      owner.client.rpc("create_poll", { p_group_id: groupId, p_title: "合宿の日程", p_options: ["8/1", "8/8", "8/15"] }),
    );
    const cards = await must(member.client.from("messages").select("id, kind").eq("poll_id", pollId));
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("poll");
    const notes = await must(member.client.from("notifications").select("kind, link").eq("ref_id", pollId));
    expect(notes).toEqual([{ kind: "poll_new", link: `/polls/${pollId}` }]);
    expect(await must(owner.client.from("notifications").select("id").eq("ref_id", pollId))).toHaveLength(0);
    // The poll is listed as unanswered for the member.
    const list = await must(member.client.rpc("list_polls", { p_group_id: groupId }));
    const row = list.find((p: { id: string }) => p.id === pollId);
    expect(row.responded).toBe(false);
    expect(row.eligible_count).toBe(3);
  });

  it("enforces single choice, answer changes and closing", async () => {
    const pollId = await must(
      owner.client.rpc("create_poll", {
        p_group_id: groupId,
        p_title: "参加しますか",
        p_options: ["はい", "いいえ"],
        p_allow_change: false,
      }),
    );
    const opts = await must(member.client.from("poll_options").select("id, position").eq("poll_id", pollId).order("position"));
    const { error: multiErr } = await member.client.rpc("submit_poll_response", {
      p_poll_id: pollId,
      p_option_ids: [opts[0].id, opts[1].id],
    });
    expect(multiErr).not.toBeNull();
    await must(member.client.rpc("submit_poll_response", { p_poll_id: pollId, p_option_ids: [opts[0].id] }));
    const { error: changeErr } = await member.client.rpc("submit_poll_response", { p_poll_id: pollId, p_option_ids: [opts[1].id] });
    expect(changeErr).not.toBeNull();
    const { error: foreignErr } = await outsider.client.rpc("submit_poll_response", { p_poll_id: pollId, p_option_ids: [opts[1].id] });
    expect(foreignErr).not.toBeNull();
    const { error: notCreator } = await member2.client.rpc("set_poll_closed", { p_poll_id: pollId, p_closed: true });
    expect(notCreator).not.toBeNull();
    await must(owner.client.rpc("set_poll_closed", { p_poll_id: pollId, p_closed: true }));
    const { error: closedErr } = await member2.client.rpc("submit_poll_response", { p_poll_id: pollId, p_option_ids: [opts[1].id] });
    expect(closedErr).not.toBeNull();
    const res = await must(member2.client.rpc("get_poll_results", { p_poll_id: pollId }));
    expect(res.response_count).toBe(1);
    expect(res.options[0].count).toBe(1);
    expect(res.options[0].voters).toEqual([member.id]);
    expect(res.non_respondents).toContain(member2.id);
  });

  it("never reveals who voted for what in anonymous polls", async () => {
    const pollId = await must(
      owner.client.rpc("create_poll", {
        p_group_id: groupId,
        p_title: "匿名アンケート",
        p_options: ["A", "B"],
        p_anonymous: true,
        p_multiple: true,
        p_allow_free_text: true,
      }),
    );
    const opts = await must(member.client.from("poll_options").select("id").eq("poll_id", pollId).order("position"));
    await must(
      member.client.rpc("submit_poll_response", { p_poll_id: pollId, p_option_ids: [opts[0].id, opts[1].id], p_free_text: "秘密" }),
    );
    const res = await must(owner.client.rpc("get_poll_results", { p_poll_id: pollId }));
    expect(res.options[0].count).toBe(1);
    expect(res.options[0].voters).toBeNull();
    expect(res.free_texts).toEqual([{ user_id: null, text: "秘密" }]);
    expect(res.non_respondents).toBeNull();
    // Even admins cannot read raw rows of other members.
    expect(await must(owner.client.from("poll_votes").select("*").eq("poll_id", pollId))).toHaveLength(0);
    expect(await must(owner.client.from("poll_responses").select("*").eq("poll_id", pollId))).toHaveLength(0);
    expect(await must(member.client.from("poll_votes").select("*").eq("poll_id", pollId))).toHaveLength(2);
  });

  it("hides results until close when configured", async () => {
    const pollId = await must(
      member2.client.rpc("create_poll", {
        p_group_id: groupId,
        p_title: "締切後に公開",
        p_options: ["X", "Y"],
        p_result_visibility: "after_close",
      }),
    );
    const opts = await must(member.client.from("poll_options").select("id").eq("poll_id", pollId).order("position"));
    await must(member.client.rpc("submit_poll_response", { p_poll_id: pollId, p_option_ids: [opts[1].id] }));
    const hidden = await must(member.client.rpc("get_poll_results", { p_poll_id: pollId }));
    expect(hidden.visible).toBe(false);
    expect(hidden.options[1].count).toBeNull();
    expect(hidden.my_option_ids).toEqual([opts[1].id]);
    const creator = await must(member2.client.rpc("get_poll_results", { p_poll_id: pollId }));
    expect(creator.visible).toBe(true);
    await must(member2.client.rpc("set_poll_closed", { p_poll_id: pollId, p_closed: true }));
    const shown = await must(member.client.rpc("get_poll_results", { p_poll_id: pollId }));
    expect(shown.visible).toBe(true);
    expect(shown.options[1].count).toBe(1);
  });

  it("respects the group setting that restricts poll creation to admins", async () => {
    await must(owner.client.from("groups").update({ member_can_create_polls: false }).eq("id", groupId));
    const { error } = await member.client.rpc("create_poll", { p_group_id: groupId, p_title: "x", p_options: ["a", "b"] });
    expect(error).not.toBeNull();
    await must(owner.client.from("groups").update({ member_can_create_polls: true }).eq("id", groupId));
  });
});

describe("events and attendance", () => {
  it("creates one event record shared by calendar and chat", async () => {
    const starts = new Date(Date.now() + 3 * 86400000).toISOString();
    const eventId = await must(
      member.client.rpc("create_event", { p_group_id: groupId, p_title: "練習", p_starts_at: starts, p_location: "体育館" }),
    );
    expect(await must(admin.from("events").select("id").eq("id", eventId))).toHaveLength(1);
    const cards = await must(owner.client.from("messages").select("id").eq("event_id", eventId));
    expect(cards).toHaveLength(1);
    await must(owner.client.rpc("share_to_chat", { p_kind: "event", p_id: eventId }));
    expect(await must(admin.from("events").select("id").eq("title", "練習").eq("group_id", groupId))).toHaveLength(1);
    expect(await must(owner.client.from("messages").select("id").eq("event_id", eventId))).toHaveLength(2);

    await must(owner.client.rpc("set_attendance", { p_event_id: eventId, p_status: "going" }));
    await must(member2.client.rpc("set_attendance", { p_event_id: eventId, p_status: "maybe", p_comment: "遅れます" }));
    await must(member2.client.rpc("set_attendance", { p_event_id: eventId, p_status: "not_going" }));
    const att = await must(member.client.rpc("get_event_attendance", { p_event_id: eventId }));
    expect(att.going).toBe(1);
    expect(att.maybe).toBe(0);
    expect(att.not_going).toBe(1);
    expect(att.non_respondents).toEqual([member.id]);
    const { error } = await outsider.client.rpc("set_attendance", { p_event_id: eventId, p_status: "going" });
    expect(error).not.toBeNull();
    const notes = await must(member2.client.from("notifications").select("kind").eq("ref_id", eventId));
    expect(notes.map((n: { kind: string }) => n.kind)).toEqual(["attendance_request"]);
  });

  it("restricts editing to creator/admin and hides individuals when configured", async () => {
    const starts = new Date(Date.now() + 5 * 86400000).toISOString();
    const eventId = await must(
      owner.client.rpc("create_event", {
        p_group_id: groupId,
        p_title: "面談",
        p_starts_at: starts,
        p_attendance_visibility: "admins",
        p_post_to_chat: false,
      }),
    );
    expect(await must(owner.client.from("messages").select("id").eq("event_id", eventId))).toHaveLength(0);
    await must(member.client.rpc("set_attendance", { p_event_id: eventId, p_status: "going" }));
    const att = await must(member2.client.rpc("get_event_attendance", { p_event_id: eventId }));
    expect(att.can_view_individuals).toBe(false);
    expect(att.responses).toBeNull();
    expect(att.going).toBe(1);
    expect(await must(member2.client.from("event_attendance").select("*").eq("event_id", eventId))).toHaveLength(0);
    const { error } = await member2.client.rpc("update_event", {
      p_event_id: eventId,
      p_title: "改ざん",
      p_starts_at: starts,
      p_ends_at: null,
      p_all_day: false,
      p_location: "",
      p_description: "",
      p_category: "other",
      p_rsvp_enabled: true,
      p_rsvp_deadline: null,
      p_attendance_visibility: "members",
    });
    expect(error).not.toBeNull();
    await member2.client.from("events").delete().eq("id", eventId);
    expect(await must(admin.from("events").select("id").eq("id", eventId))).toHaveLength(1);
  });

  it("rejects attendance after the deadline", async () => {
    const starts = new Date(Date.now() + 5 * 86400000).toISOString();
    const eventId = await must(
      owner.client.rpc("create_event", { p_group_id: groupId, p_title: "締切済み", p_starts_at: starts, p_post_to_chat: false }),
    );
    await must(admin.from("events").update({ rsvp_deadline: new Date(Date.now() - 60000).toISOString() }).eq("id", eventId));
    const { error } = await member.client.rpc("set_attendance", { p_event_id: eventId, p_status: "going" });
    expect(error).not.toBeNull();
  });
});

describe("announcements", () => {
  it("restricts posting and pinning according to settings", async () => {
    const { error } = await member.client.rpc("create_announcement", { p_group_id: groupId, p_title: "x", p_body: "y" });
    expect(error).not.toBeNull();
    const id = await must(
      owner.client.rpc("create_announcement", { p_group_id: groupId, p_title: "大会のお知らせ", p_body: "詳細", p_important: true, p_pinned: true }),
    );
    const notes = await must(member.client.from("notifications").select("title").eq("ref_id", id));
    expect(notes[0].title).toContain("【重要】");
    await must(owner.client.from("groups").update({ member_can_post_announcements: true }).eq("id", groupId));
    const mine = await must(member.client.rpc("create_announcement", { p_group_id: groupId, p_title: "連絡", p_body: "本文" }));
    const { error: pinErr } = await member.client.from("announcements").update({ pinned: true }).eq("id", mine);
    expect(pinErr).not.toBeNull();
    await member2.client.from("announcements").update({ title: "改ざん" }).eq("id", id);
    expect((await must(admin.from("announcements").select("title").eq("id", id).single())).title).toBe("大会のお知らせ");
    await must(member.client.from("announcement_reads").insert({ announcement_id: id, user_id: member.id }));
    const { error: forgeErr } = await member.client.from("announcement_reads").insert({ announcement_id: id, user_id: member2.id });
    expect(forgeErr).not.toBeNull();
    const rc = await must(owner.client.rpc("get_announcement_read_count", { p_announcement_id: id }));
    expect(rc).toEqual({ read: 2, members: 3 });
  });
});

describe("notifications and push subscriptions", () => {
  it("keeps notifications private to their recipient", async () => {
    const theirs = await must(admin.from("notifications").select("id").eq("user_id", member.id).limit(1).single());
    expect(await must(member2.client.from("notifications").select("id").eq("id", theirs.id))).toHaveLength(0);
    await member2.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", theirs.id);
    const row = await must(admin.from("notifications").select("read_at").eq("id", theirs.id).single());
    expect(row.read_at).toBeNull();
    await must(member.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", theirs.id));
  });

  it("reassigns a device endpoint to the latest user and hides it from others", async () => {
    const endpoint = `https://push.example.test/${crypto.randomUUID()}`;
    await must(member.client.rpc("register_push_subscription", { p_endpoint: endpoint, p_p256dh: "k", p_auth: "a" }));
    expect(await must(member2.client.from("push_subscriptions").select("id"))).toHaveLength(0);
    await must(member2.client.rpc("register_push_subscription", { p_endpoint: endpoint, p_p256dh: "k2", p_auth: "a2" }));
    const rows = await must(admin.from("push_subscriptions").select("user_id").eq("endpoint", endpoint));
    expect(rows).toEqual([{ user_id: member2.id }]);
    const { error } = await member.client.from("push_subscriptions").insert({ user_id: member.id, endpoint: "x", p256dh: "y", auth: "z" });
    expect(error).not.toBeNull();
  });

  it("creates deadline reminders once", async () => {
    const pollId = await must(
      owner.client.rpc("create_poll", {
        p_group_id: groupId,
        p_title: "リマインド確認",
        p_options: ["A", "B"],
        p_deadline: new Date(Date.now() + 3600 * 1000 * 5).toISOString(),
      }),
    );
    await must(admin.from("polls").update({ created_at: new Date(Date.now() - 7200 * 1000).toISOString() }).eq("id", pollId));
    sql("select private.process_reminders()");
    sql("select private.process_reminders()");
    const notes = await must(member.client.from("notifications").select("kind").eq("ref_id", pollId));
    expect(notes.map((n: { kind: string }) => n.kind).sort()).toEqual(["poll_deadline", "poll_new"]);
    const mine = await must(owner.client.from("notifications").select("kind").eq("ref_id", pollId));
    expect(mine.map((n: { kind: string }) => n.kind)).toEqual(["poll_deadline"]);
    const opts = await must(member2.client.from("poll_options").select("id").eq("poll_id", pollId));
    await must(member2.client.rpc("submit_poll_response", { p_poll_id: pollId, p_option_ids: [opts[0].id] }));
  });
});

describe("storage", () => {
  it("isolates group media from outsiders and validates attachments", async () => {
    const path = `g/${groupId}/chat/${conversationId}/${crypto.randomUUID()}.txt`;
    const file = new Blob(["秘密のファイル"], { type: "text/plain" });
    const { error: upErr } = await member.client.storage.from("media").upload(path, file, { contentType: "text/plain" });
    expect(upErr).toBeNull();
    const { error: outUp } = await outsider.client.storage
      .from("media")
      .upload(`g/${groupId}/chat/${conversationId}/evil.txt`, file, { contentType: "text/plain" });
    expect(outUp).not.toBeNull();
    const { error: outDl } = await outsider.client.storage.from("media").download(path);
    expect(outDl).not.toBeNull();
    const { data: dl } = await member2.client.storage.from("media").download(path);
    expect(await dl?.text()).toBe("秘密のファイル");
    const { error: signErr } = await outsider.client.storage.from("media").createSignedUrl(path, 60);
    expect(signErr).not.toBeNull();

    // Another member cannot claim someone else's upload as their attachment.
    const { error: claimErr } = await member2.client.rpc("send_message", {
      p_conversation_id: conversationId,
      p_client_id: crypto.randomUUID(),
      p_body: "",
      p_attachments: [{ path, name: "x.txt", mime: "text/plain", size: 10 }],
    });
    expect(claimErr).not.toBeNull();
    const msg = await must(
      member.client.rpc("send_message", {
        p_conversation_id: conversationId,
        p_client_id: crypto.randomUUID(),
        p_body: "資料です",
        p_attachments: [{ path, name: "資料.txt", mime: "text/plain", size: 10 }],
      }),
    );
    expect(msg.kind).toBe("file");
    const media = await must(member2.client.from("media_items").select("storage_path").eq("message_id", msg.id));
    expect(media).toEqual([{ storage_path: path }]);
    expect(await must(outsider.client.from("media_items").select("id").eq("message_id", msg.id))).toHaveLength(0);
  });
});
