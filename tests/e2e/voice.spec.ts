import { expect, test } from "@playwright/test";
import { createConfirmedUser, signIn } from "./helpers";
import { TEST_USER } from "./test-user";

// Chromium's fake microphone plays a test tone, so no real audio is needed.
test.use({
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

// Like ai.spec.ts: needs the dev server started with AI_PROVIDER=mock (the mock "hears" a fixed sentence); skipped otherwise.
test("voice: record → transcribe on the server → edit → Read it (mock provider)", async ({ page }, info) => {
  const email = TEST_USER.email.replace("@", `+voice-${info.project.name}@`);
  await createConfirmedUser(email, TEST_USER.password);
  await signIn(page, email, TEST_USER.password);

  await page.goto("/settings/ai");
  await page.getByText(/^Provider: /).waitFor();
  test.skip(!(await page.getByText("Provider: Mock AI").isVisible()), "dev server is not running with AI_PROVIDER=mock");

  await page.goto("/");
  await page.getByRole("button", { name: "Add transaction" }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog");
  const box = dialog.getByLabel("Describe a transaction");
  await expect(dialog.getByText(/recording is sent to the AI provider/)).toBeVisible();

  // keeps what was already typed, then appends what was heard
  await box.fill("for the team");
  await dialog.getByRole("button", { name: "Speak" }).click();
  await expect(dialog.getByRole("button", { name: "Stop listening" })).toBeVisible();
  await expect(box).toHaveAttribute("placeholder", "Listening…");
  await page.waitForTimeout(1500);
  await dialog.getByRole("button", { name: "Stop listening" }).click();

  // the transcript lands in the box for review, and nothing is submitted for the user
  await expect(box).toHaveValue("for the team 12.50 Mock Cafe lunch");
  await expect(dialog.getByRole("region", { name: "Transaction 1" })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Read it" }).click();
  const card = dialog.getByRole("region", { name: "Transaction 1" });
  await expect(card.getByText("Mock Cafe")).toBeVisible();
  await expect(card.getByText("$12.50")).toBeVisible();

  // a recording shorter than the minimum is refused before any allowance is used
  await dialog.getByLabel("Describe a transaction").fill("");
  await dialog.getByRole("button", { name: "Speak" }).click();
  await dialog.getByRole("button", { name: "Stop listening" }).click();
  await expect(page.getByText(/That was too short/)).toBeVisible();
});
