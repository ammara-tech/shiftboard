import { describe, expect, it } from "vitest";
import { readSummary, recentNotices, unreadFor } from "@/lib/notices";
import type { Notice } from "@/lib/types";

const DAY = 86400000;
const notice = (n: Partial<Notice>): Notice => ({ id: "n", text: "Stock take", by: "me", createdAt: 0, readBy: [], ...n });
const team = { memberIds: ["me", "thabo", "lerato"], members: { me: { name: "Ammara", joinedAt: 0 }, thabo: { name: "Thabo", joinedAt: 0 }, lerato: { name: "Lerato", joinedAt: 0 } } };

describe("the notice board", () => {
  it("shows the newest notices from the last 30 days", () => {
    const now = 40 * DAY;
    const list = [notice({ id: "old", createdAt: 5 * DAY }), notice({ id: "a", createdAt: 30 * DAY }), notice({ id: "b", createdAt: 39 * DAY })];
    expect(recentNotices(list, now).map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("knows what you haven't read (not counting your own)", () => {
    const list = [notice({ id: "mine" }), notice({ id: "new", by: "thabo" }), notice({ id: "read", by: "thabo", readBy: ["lerato"] })];
    expect(unreadFor(list, "lerato").map((n) => n.id)).toEqual(["mine", "new"]);
    expect(unreadFor(list, "me").map((n) => n.id)).toEqual(["new", "read"]);
  });

  it("tells managers who has read it", () => {
    expect(readSummary(notice({ readBy: ["thabo"] }), team)).toEqual({ read: ["Thabo"], notRead: ["Lerato"] });
  });
});
