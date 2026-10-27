import { beforeAll, describe, expect, it } from "vitest";
import { admin, createTestUser, must, type TestUser } from "./helpers";

// Profile photos (u/{user}/…) and group icons (g/{group}/icon/…).
let owner: TestUser;
let member: TestUser;
let outsider: TestUser;
let groupId: string;

const file = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], { type: "image/png" });
const png = { contentType: "image/png" };

beforeAll(async () => {
  [owner, member, outsider] = await Promise.all([createTestUser("IcOwner"), createTestUser("IcMember"), createTestUser("IcOutsider")]);
  groupId = await must(owner.client.rpc("create_group", { p_name: "アイコン部" }));
  const invite = await must(owner.client.from("group_invites").select("code").eq("group_id", groupId).single());
  await must(member.client.rpc("join_group", { p_code: invite.code }));
});

describe("profile photos", () => {
  it("only the user can upload to their own folder", async () => {
    const own = `u/${member.id}/${crypto.randomUUID()}.png`;
    expect((await member.client.storage.from("media").upload(own, file(), png)).error).toBeNull();
    const forged = `u/${owner.id}/${crypto.randomUUID()}.png`;
    expect((await member.client.storage.from("media").upload(forged, file(), png)).error).not.toBeNull();
  });

  it("is readable by people who share a group, and by nobody else", async () => {
    const path = `u/${owner.id}/${crypto.randomUUID()}.png`;
    expect((await owner.client.storage.from("media").upload(path, file(), png)).error).toBeNull();
    expect((await member.client.storage.from("media").download(path)).error).toBeNull();
    expect((await outsider.client.storage.from("media").download(path)).error).not.toBeNull();
  });

  it("rejects a profile photo path that belongs to someone else", async () => {
    const { error } = await member.client.from("profiles").update({ avatar_url: `u/${owner.id}/x.png` }).eq("id", member.id);
    expect(error).not.toBeNull();
    const ok = await member.client.from("profiles").update({ avatar_url: `u/${member.id}/x.png` }).eq("id", member.id);
    expect(ok.error).toBeNull();
  });

  it("does not let a Google avatar change overwrite a custom photo", async () => {
    await admin.auth.admin.updateUserById(member.id, { user_metadata: { avatar_url: "https://example.test/new-google.png" } });
    const p = await must(admin.from("profiles").select("avatar_url").eq("id", member.id).single());
    expect(p.avatar_url).toBe(`u/${member.id}/x.png`);
    await member.client.from("profiles").update({ avatar_url: null }).eq("id", member.id);
    await admin.auth.admin.updateUserById(member.id, { user_metadata: { avatar_url: "https://example.test/newer-google.png" } });
    const q = await must(admin.from("profiles").select("avatar_url").eq("id", member.id).single());
    expect(q.avatar_url).toBe("https://example.test/newer-google.png");
  });
});

describe("group icons", () => {
  it("only admins can upload and set the icon; members can read it", async () => {
    const path = `g/${groupId}/icon/${crypto.randomUUID()}.png`;
    expect((await member.client.storage.from("media").upload(path, file(), png)).error).not.toBeNull();
    expect((await outsider.client.storage.from("media").upload(path, file(), png)).error).not.toBeNull();
    expect((await owner.client.storage.from("media").upload(path, file(), png)).error).toBeNull();
    expect((await member.client.storage.from("media").download(path)).error).toBeNull();
    expect((await outsider.client.storage.from("media").download(path)).error).not.toBeNull();

    await member.client.from("groups").update({ icon_path: path }).eq("id", groupId);
    expect((await must(admin.from("groups").select("icon_path").eq("id", groupId).single())).icon_path).toBeNull();
    await must(owner.client.from("groups").update({ icon_path: path }).eq("id", groupId));
    const convs = await must(member.client.rpc("get_conversations"));
    expect(convs.find((c: { group_id: string }) => c.group_id === groupId).group_icon_path).toBe(path);
  });

  it("rejects an icon path that points into another group", async () => {
    const other = await must(owner.client.rpc("create_group", { p_name: "別のグループ" }));
    const { error } = await owner.client.from("groups").update({ icon_path: `g/${other}/icon/x.png` }).eq("id", groupId);
    expect(error).not.toBeNull();
  });
});
