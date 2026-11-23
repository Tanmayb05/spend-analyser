import { beforeEach, describe, expect, it, vi } from "vitest";

// --- verifyPassword ---------------------------------------------------------------------
const auth = vi.hoisted(() => ({
  result: { data: { user: { id: "u1" } }, error: null } as { data: { user: { id: string } | null }; error: unknown },
  signIn: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: (...a: unknown[]) => {
        auth.signIn(...a);
        return Promise.resolve(auth.result);
      },
      signOut: auth.signOut,
    },
  }),
}));

import { verifyPassword } from "@/lib/supabase/reauth";
import { removeUserReceipts } from "@/lib/receipt-storage";

describe("verifyPassword", () => {
  beforeEach(() => {
    auth.result = { data: { user: { id: "u1" } }, error: null };
    auth.signIn.mockClear();
    auth.signOut.mockClear();
  });

  it("accepts the right password for the same user and ends the throwaway session", async () => {
    expect(await verifyPassword("a@b.c", "pw", "u1")).toBe(true);
    expect(auth.signIn).toHaveBeenCalledWith({ email: "a@b.c", password: "pw" });
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("rejects a wrong password", async () => {
    auth.result = { data: { user: null }, error: { message: "Invalid login credentials" } };
    expect(await verifyPassword("a@b.c", "bad", "u1")).toBe(false);
  });

  it("rejects valid credentials that belong to a different user", async () => {
    auth.result = { data: { user: { id: "someone-else" } }, error: null };
    expect(await verifyPassword("a@b.c", "pw", "u1")).toBe(false);
  });

  it("rejects empty input without calling auth", async () => {
    expect(await verifyPassword("a@b.c", "", "u1")).toBe(false);
    expect(await verifyPassword("", "pw", "u1")).toBe(false);
    expect(auth.signIn).not.toHaveBeenCalled();
  });
});

// --- removeUserReceipts -------------------------------------------------------------------
type Entry = { name: string; id: string | null };

function fakeStorage(tree: Record<string, Entry[]>, covers: Record<string, Entry[]> = {}) {
  const removed: string[][] = [];
  const trees: Record<string, Record<string, Entry[]>> = { receipts: tree, "trip-covers": covers };
  const client = {
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string, opts: { limit: number; offset: number }) => ({
          data: (trees[bucket]?.[prefix] ?? []).slice(opts.offset, opts.offset + opts.limit),
          error: null,
        }),
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        },
      }),
    },
  };
  return { client: client as never, removed };
}

describe("removeUserReceipts", () => {
  it("removes top-level files and files inside the uploads folder", async () => {
    const { client, removed } = fakeStorage({
      u1: [
        { name: "abc.jpg", id: "1" },
        { name: "uploads", id: null },
      ],
      "u1/uploads": [
        { name: "x.png", id: "2" },
        { name: "y.pdf", id: "3" },
      ],
    });
    expect(await removeUserReceipts(client, "u1")).toBe(3);
    expect(removed.flat().sort()).toEqual(["u1/abc.jpg", "u1/uploads/x.png", "u1/uploads/y.pdf"]);
  });

  it("pages past 100 files and removes in chunks", async () => {
    const many = Array.from({ length: 230 }, (_, i) => ({ name: `f${i}.jpg`, id: String(i) }));
    const { client, removed } = fakeStorage({ u1: many });
    expect(await removeUserReceipts(client, "u1")).toBe(230);
    expect(removed.map((r) => r.length)).toEqual([100, 100, 30]);
  });

  it("also removes trip cover photos", async () => {
    const { client, removed } = fakeStorage({ u1: [{ name: "abc.jpg", id: "1" }] }, { u1: [{ name: "trip-1.webp", id: "9" }] });
    expect(await removeUserReceipts(client, "u1")).toBe(2);
    expect(removed.flat().sort()).toEqual(["u1/abc.jpg", "u1/trip-1.webp"]);
  });

  it("does nothing for a user with no files", async () => {
    const { client, removed } = fakeStorage({});
    expect(await removeUserReceipts(client, "u1")).toBe(0);
    expect(removed).toEqual([]);
  });
});
