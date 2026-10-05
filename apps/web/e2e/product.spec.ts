import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  const payload = Buffer.from(
    JSON.stringify({ sub: "ui-user", type: "access", exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url");
  await context.addCookies([
    {
      name: "rehearse_access_token",
      value: `fixture.${payload}.ui-fixture`,
      url: "http://127.0.0.1:3199",
      httpOnly: true,
    },
  ]);
});

test("product pages fit narrow screens in both themes", async ({ page }, testInfo) => {
  test.setTimeout(120000);
  for (const theme of ["dark", "light"]) {
    await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "/interview",
        "/settings",
        "/progress",
        "/report/answer-1",
        "/session/session-1/summary",
      ]) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveClass(new RegExp(theme));
        await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
          `${path} overflows horizontally at ${width}px (${theme})`,
        ).toBe(true);
        if (width === 320)
          await page.screenshot({
            path: testInfo.outputPath(`${theme}-${path.replaceAll("/", "-")}.png`),
            fullPage: true,
          });
      }
    }
  }
});

test("setup preserves entries on failure and validates experience", async ({ page }) => {
  await page.goto("/interview");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: "Backend", exact: true }).check();
  await page.getByLabel("Target company (optional)").fill("Example company");
  await page.getByText("About you (optional)").click();
  await page.getByLabel("Years of experience").fill("81");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator("p[role=alert]")).toHaveText(/between 0 and 80/);
  await page.getByLabel("Years of experience").fill("5");
  await page.route("**/api/interview/sessions", (route) =>
    route.fulfill({ status: 503, json: { error: { message: "Please try again." } } }),
  );
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Start interview", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toHaveText("Please try again.");
  await page.getByRole("button", { name: "Edit role" }).click();
  await expect(page.getByLabel("Target company (optional)")).toHaveValue("Example company");
});

test("settings saves normalized values and protects further edits", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Display name").fill("  Ada  ");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.getByLabel("Display name").fill("Grace");
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Progress" })
    .click();
  await expect(page).toHaveURL(/settings/);
});

test("history pages link to a resumable summary", async ({ page }) => {
  await page.goto("/progress");
  await page.getByRole("link", { name: "Older sessions" }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole("link", { name: "View summary" }).click();
  await expect(page.getByText("Your progress so far", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Resume interview" })).toBeVisible();
});

test("recording survives canceled navigation and a temporary rate limit", async ({ page }) => {
  await page.goto("/interview");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: "Backend", exact: true }).check();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Start interview", exact: true }).click();
  await page.getByRole("button", { name: "Skip check" }).click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByRole("button", { name: "Submit answer" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Progress" })
    .click();
  await expect(page.getByRole("button", { name: "Submit answer" })).toBeVisible();
  await page.route("**/api/interview/answers", (route) =>
    route.fulfill({
      status: 429,
      headers: { "Retry-After": "60" },
      json: { error: { code: "rate_limited", message: "Please wait." } },
    }),
  );
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).toContainText(
    "60 seconds",
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
