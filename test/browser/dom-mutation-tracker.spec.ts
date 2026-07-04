import { expect, test, type Page } from "@playwright/test";

interface BrowserEvent {
  readonly type: "attributes" | "childList" | "characterData";
  readonly sequence: number;
  readonly target: {
    readonly selector: string;
    readonly description: string;
  };
  readonly attributeName?: string;
  readonly oldValue?: string | null;
  readonly newValue?: string | null;
  readonly addedNodes?: readonly unknown[];
}

async function recordedEvents(page: Page): Promise<BrowserEvent[]> {
  return JSON.parse(
    (await page.getByLabel("Recorded events").textContent()) ?? "[]",
  ) as BrowserEvent[];
}

test.beforeEach(async ({ page }) => {
  await page.goto("/test/browser/fixture.html");
  await expect(page.locator("body")).toHaveAttribute(
    "data-fixture-ready",
    "true",
  );
});

test("records mutation types in order and controls lifecycle cleanly", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Attribute mutation" }).click();
  await page.getByRole("button", { name: "Child mutation" }).click();
  await page.getByRole("button", { name: "Text mutation" }).click();

  await expect.poll(() => recordedEvents(page)).toHaveLength(3);
  const initialEvents = await recordedEvents(page);
  expect(initialEvents.map((event) => event.type)).toEqual([
    "attributes",
    "childList",
    "characterData",
  ]);
  expect(initialEvents[0]).toMatchObject({
    sequence: 1,
    attributeName: "data-state",
    oldValue: null,
    newValue: "1",
  });
  expect(initialEvents[1]?.addedNodes).toHaveLength(1);
  expect(initialEvents[2]).toMatchObject({
    oldValue: "before",
    newValue: "text-1",
  });

  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "Attribute mutation" }).click();
  await page.waitForTimeout(50);
  expect(await recordedEvents(page)).toHaveLength(3);

  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Attribute mutation" }).click();
  await expect.poll(() => recordedEvents(page)).toHaveLength(4);

  await page.getByRole("button", { name: "Clear" }).click();
  expect(await recordedEvents(page)).toEqual([]);
});

test("ignores presentation mutations and removes presentation state", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Mount panel", exact: true }).click();
  await page.getByRole("button", { name: "Mount panel", exact: true }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Attribute mutation" }).click();

  const target = page.locator("#attribute-target");
  await expect(target).toHaveClass(/mutation-tracker-highlight/);
  await expect.poll(() => recordedEvents(page)).toHaveLength(1);
  await page.waitForTimeout(450);

  const events = await recordedEvents(page);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: "attributes",
    attributeName: "data-state",
  });
  await expect(target).not.toHaveClass(/mutation-tracker-highlight/);
  await expect(page.locator('style[data-mutation-tracker="true"]')).toHaveCount(
    1,
  );

  await page
    .getByRole("button", { name: "Unmount panel", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Unmount panel", exact: true })
    .click();
  await expect(page.locator('style[data-mutation-tracker="true"]')).toHaveCount(
    0,
  );
});

test("handles SVG targets with valid selectors in a real browser", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "SVG mutation" }).click();

  await expect.poll(() => recordedEvents(page)).toHaveLength(1);
  const [event] = await recordedEvents(page);
  expect(event).toMatchObject({
    type: "attributes",
    attributeName: "data-state",
    target: { description: "circle#svg-child.shape" },
  });
  expect(await page.locator(event?.target.selector ?? "unknown").count()).toBe(
    1,
  );
});
