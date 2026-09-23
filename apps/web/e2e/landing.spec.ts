import { expect, test } from "@playwright/test";

test("landing page renders without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("all landing sections are present", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#how-it-works")).toBeAttached();
  await expect(page.locator("#sample-report")).toBeAttached();
  await expect(page.locator("#roles")).toBeAttached();
  await expect(page.locator("#progress")).toBeAttached();
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("nav anchors scroll to their sections", async ({ page }) => {
  // These links only render in the desktop nav (mobile relies on the CTA pill instead).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  await page.getByRole("link", { name: "Question bank" }).click();
  await expect(page.locator("#roles")).toBeInViewport();

  await page.getByRole("link", { name: "Progress" }).click();
  await expect(page.locator("#progress")).toBeInViewport();
});

test("theme toggle switches theme without a flash", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);

  await page.getByRole("button", { name: /switch to light mode/i }).click();
  await expect(html).toHaveClass(/light/);

  const inkColor = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--ink").trim(),
  );
  expect(inkColor.toLowerCase()).toBe("#f7f6f1");
});

test("no horizontal scroll at mobile or desktop width", async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  }
});

test("sign-in link does not 404", async ({ page }) => {
  await page.goto("/");
  const response = await page.request.get("/sign-in");
  expect(response.status()).toBe(200);
});
