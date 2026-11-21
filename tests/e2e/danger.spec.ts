import { expect, test } from "@playwright/test";
import { admin, createConfirmedUser, deleteUserByEmail, signIn } from "./helpers";
import { TEST_USER } from "./test-user";

test.describe("reset or delete (password-gated)", () => {
  test("options switch the confirm word and button", async ({ page }, info) => {
    const email = TEST_USER.email.replace("@", `+opts-${info.project.name}@`);
    await createConfirmedUser(email, TEST_USER.password);
    await signIn(page, email, TEST_USER.password);
    await page.goto("/settings/data");

    await expect(page.getByRole("radio", { name: /Wipe data only/ })).toBeChecked();
    await expect(page.getByRole("button", { name: "Wipe data", exact: true })).toBeDisabled();
    await page.getByRole("radio", { name: /Wipe data and setup/ }).check();
    await expect(page.getByLabel("Type RESET to confirm")).toBeVisible();
    await expect(page.getByRole("button", { name: "Wipe data and setup" })).toBeDisabled();
    await page.getByRole("radio", { name: /Delete account/ }).check();
    await expect(page.getByLabel("Type DELETE to confirm")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete my account" })).toBeDisabled();

    // the old standalone card is gone
    await expect(page.getByText("Delete all transactions")).toHaveCount(0);
    await deleteUserByEmail(email);
  });

  test("wipe data only: wrong password blocked, right password wipes data and keeps setup", async ({ page }, info) => {
    const email = TEST_USER.email.replace("@", `+reset-${info.project.name}@`);
    const user = await createConfirmedUser(email, TEST_USER.password);
    const db = admin();
    const { data: cat } = await db.from("categories").select("id").eq("user_id", user.id).eq("name", "Groceries").single();
    await db.from("transactions").insert({ user_id: user.id, date: "2026-01-05", type: "expense", amount: 12, category_id: cat!.id });

    await signIn(page, email, TEST_USER.password);
    await page.goto("/settings/data");
    await page.getByLabel("Type RESET to confirm").fill("RESET");
    await page.getByLabel("Current password").fill("WrongPass123");
    await page.getByRole("button", { name: "Wipe data", exact: true }).click();
    await expect(page.getByText("Wrong password.")).toBeVisible();
    const before = await db.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    expect(before.count).toBe(1);

    await page.getByLabel("Current password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Wipe data", exact: true }).click();
    await expect(page.getByText("Done", { exact: true })).toBeVisible();
    const after = await db.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    expect(after.count).toBe(0);
    const cats = await db.from("categories").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    expect(cats.count).toBe(13);

    await deleteUserByEmail(email);
  });

  test("wipe data and setup: restores default categories", async ({ page }, info) => {
    const email = TEST_USER.email.replace("@", `+setup-${info.project.name}@`);
    const user = await createConfirmedUser(email, TEST_USER.password);
    const db = admin();
    await db.from("categories").update({ name: "Renamed" }).eq("user_id", user.id).eq("name", "Groceries");

    await signIn(page, email, TEST_USER.password);
    await page.goto("/settings/data");
    await page.getByRole("radio", { name: /Wipe data and setup/ }).check();
    await page.getByLabel("Type RESET to confirm").fill("RESET");
    await page.getByLabel("Current password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Wipe data and setup" }).click();
    await expect(page.getByText("Done", { exact: true })).toBeVisible();
    const groceries = await db.from("categories").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("name", "Groceries");
    expect(groceries.count).toBe(1);

    await deleteUserByEmail(email);
  });

  test("delete account: wrong password blocked, right password deletes", async ({ page }, info) => {
    const email = TEST_USER.email.replace("@", `+del-${info.project.name}@`);
    const user = await createConfirmedUser(email, TEST_USER.password);

    await signIn(page, email, TEST_USER.password);
    await page.goto("/settings/data");
    await page.getByRole("radio", { name: /Delete account/ }).check();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByLabel("Current password").fill("WrongPass123");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByText("Wrong password.")).toBeVisible();
    expect((await admin().auth.admin.getUserById(user.id)).data.user).not.toBeNull();

    await page.getByLabel("Current password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page).toHaveURL(/\/signup/);
    expect((await admin().auth.admin.getUserById(user.id)).data.user).toBeNull();
  });
});

test.describe("import sample", () => {
  test("both sample formats download and the guide is visible", async ({ page }, info) => {
    const email = TEST_USER.email.replace("@", `+tpl-${info.project.name}@`);
    await createConfirmedUser(email, TEST_USER.password);
    await signIn(page, email, TEST_USER.password);
    await page.goto("/settings/data");
    await expect(page.getByText("How import works")).toBeVisible();
    await expect(page.getByText("Clean before you import")).toBeVisible();

    const xlsx = await page.request.get("/api/import-template?format=xlsx");
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    const csv = await page.request.get("/api/import-template?format=csv");
    expect(csv.status()).toBe(200);
    expect((await csv.text()).split("\n")[0]).toContain("Date,Type,Category");
    expect((await page.request.get("/api/import-template?format=pdf")).status()).toBe(400);

    await deleteUserByEmail(email);
  });
});
