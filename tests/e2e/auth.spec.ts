import { expect, test } from "@playwright/test";
import { clearMail, deleteUserByEmail, latestLink, signIn } from "./helpers";
import { TEST_USER } from "./test-user";

test.describe("account management", () => {
  test("signup → confirm email → sign out → forgot password → reset → sign in", async ({ page, browser }, info) => {
    const email = TEST_USER.email.replace("@", `+auth-${info.project.name}@`);
    await deleteUserByEmail(email);
    await clearMail();

    // validation
    await page.goto("/signup");
    await page.getByLabel("Name").fill(TEST_USER.name);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("weak");
    await page.getByLabel("Confirm password").fill("weak");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("At least 8 characters")).toBeVisible();

    await page.getByLabel("Password", { exact: true }).fill(TEST_USER.password);
    await page.getByLabel("Confirm password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/We sent a confirmation link/)).toBeVisible();

    // unconfirmed user cannot sign in
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Confirm your email first/)).toBeVisible();

    // confirm
    await page.goto(await latestLink(email));
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    // sign out
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);

    // wrong password
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("WrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Wrong email or password.")).toBeVisible();

    // forgot password
    await clearMail();
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/reset link is on its way/)).toBeVisible();

    // open the link in a fresh browser (like tapping it in a phone's mail app)
    const resetLink = await latestLink(email);
    const other = await browser.newContext({ baseURL: info.project.use.baseURL });
    const phone = await other.newPage();
    await phone.goto(resetLink);
    await expect(phone).toHaveURL(/\/reset-password/);
    const newPassword = `${TEST_USER.password}9`;
    await phone.getByLabel("New password").fill(newPassword);
    await phone.getByLabel("Confirm password").fill(newPassword);
    await phone.getByRole("button", { name: "Update password" }).click();
    await expect(phone.getByText("Password updated.")).toBeVisible();
    await other.close();

    // a used link can't be replayed
    await page.goto(resetLink);
    await expect(page).toHaveURL(/\/forgot-password\?error=link/);
    await expect(page.getByText(/already used or expired/)).toBeVisible();

    await page.context().clearCookies();
    await signIn(page, email, newPassword);
    await deleteUserByEmail(email);
  });
});
