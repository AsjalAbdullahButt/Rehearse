import AxeBuilder from "@axe-core/playwright";
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

const PATHS = [
  "/dashboard",
  "/interview",
  "/progress",
  "/mastery",
  "/settings",
  "/report/answer-1",
  "/session/session-1/summary",
];

// 375px (phone) and 1024px (small laptop / landscape tablet) complete the 320/768/1440 coverage
// in product.spec.ts; both themes, because contrast problems are usually one theme only.
for (const theme of ["dark", "light"]) {
  for (const width of [375, 1024]) {
    test(`no serious accessibility violations or overflow: ${theme} ${width}px`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120000);
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      await page.setViewportSize({ width, height: 900 });

      for (const path of PATHS) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        );
        expect(overflow, `${path} overflows horizontally at ${width}px (${theme})`).toBe(true);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const serious = results.violations.filter(
          (violation) => violation.impact === "serious" || violation.impact === "critical",
        );
        expect(
          serious.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
          })),
          `${path} (${theme}, ${width}px)`,
        ).toEqual([]);

        await page.screenshot({
          path: testInfo.outputPath(`${theme}-${width}-${path.replaceAll("/", "-")}.png`),
          fullPage: true,
        });
      }
    });
  }
}
