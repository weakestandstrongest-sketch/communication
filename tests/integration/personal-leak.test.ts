import { it, expect } from "vitest";
import { admin, createTestUser, must } from "./helpers";

it("a personal event cannot be read, changed or found by group mates, admins or outsiders (10 read routes + 3 write routes)", async () => {
  const [me, mate, admn, out] = await Promise.all([createTestUser("LkMe"), createTestUser("LkMate"), createTestUser("LkAdmin"), createTestUser("LkOut")]);
  const g = await must(admn.client.rpc("create_group", { p_name: "漏洩確認" }));
  const code = (await must(admn.client.from("group_invites").select("code").eq("group_id", g).single())).code;
  await must(me.client.rpc("join_group", { p_code: code }));
  await must(mate.client.rpc("join_group", { p_code: code }));
  const id = await must(me.client.rpc("create_personal_event", { p_title: "ひみつ", p_starts_at: new Date(Date.now() + 3600e3).toISOString(), p_location: "ひみつの場所", p_description: "ひみつの説明" }));
  const found: string[] = [];
  for (const [name, u] of [["mate", mate], ["admin", admn], ["outsider", out]] as const) {
    const c = u.client;
    const reads = [
      await c.from("events").select("*").eq("id", id),
      await c.from("events").select("*").ilike("title", "%ひみつ%"),
      await c.from("events").select("*").is("group_id", null),
      await c.from("events").select("*").not("personal_user_id", "is", null),
      await c.from("events").select("*").eq("personal_user_id", me.id),
      await c.from("event_attendance").select("*").eq("event_id", id),
      await c.from("messages").select("*").eq("event_id", id),
      await c.from("notifications").select("*").eq("ref_id", id),
      await c.rpc("get_event_attendance", { p_event_id: id }),
      await c.rpc("share_to_chat", { p_kind: "event", p_id: id }),
    ];
    reads.forEach((r, i) => { if (JSON.stringify(r.data ?? "").includes("ひみつ") || JSON.stringify(r.data ?? "").includes(id)) found.push(`${name}#${i}`); });
    // can't modify / delete / cancel either
    await c.from("events").update({ title: "改ざん" }).eq("id", id);
    await c.from("events").delete().eq("id", id);
    await c.rpc("set_event_canceled", { p_event_id: id, p_canceled: true });
  }
  expect(found).toEqual([]);
  const row = await must(admin.from("events").select("title, canceled_at").eq("id", id).single());
  expect(row).toEqual({ title: "ひみつ", canceled_at: null });
});
