import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));

await page.goto(process.env.CHECK_URL || "http://127.0.0.1:5173/spin-wheel/");
const charge = page.locator(".charge-button");
await charge.waitFor();
await page.waitForFunction(() => !document.querySelector(".charge-button").disabled);
assert.equal(await page.locator(".wheel-disc foreignObject").count(), 0);
assert.equal(await page.locator(".wheel-disc path").count(), 6);
assert.equal(await page.locator(".wheel-disc image").count(), 6);
assert.equal(
  await page.locator('.wheel-disc image.prize-image-shirt').getAttribute("href"),
  "/assets/baju-howell.png",
);

const energy = () => page.locator(".energy-number").evaluate((node) => parseInt(node.textContent, 10));
const rotation = () => page.locator(".wheel-disc").evaluate((node) => Number(node.style.transform.match(/rotate\((.*)deg\)/)?.[1] || 0));
const pointerIndex = (angle) => Math.round(((360 - (angle % 360)) % 360) / (360 / 6)) % 6;

async function hold(ms) {
  const box = await charge.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForFunction(() => /phase-(spinning|decelerating|settling|result)/.test(document.querySelector(".app").className));
  const released = await energy();
  await page.locator(".win-dialog").waitFor({ timeout: 4000 });
  const finalRotation = await rotation();
  const saved = await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open("howell-booth", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return await new Promise((resolve) => {
      const request = database.transaction("app").objectStore("app").get("state");
      request.onsuccess = () => resolve(request.result);
    });
  });
  const spin = saved.spins.at(-1);
  assert.equal(pointerIndex(finalRotation), spin.segment);
  await page.getByRole("button", { name: "SELESAI" }).click();
  await page.waitForFunction(() => document.querySelector(".app").classList.contains("phase-idle"));
  assert.equal(await energy(), 0);
  return { released, finalRotation };
}

const shortBox = await charge.boundingBox();
await page.mouse.move(shortBox.x + shortBox.width / 2, shortBox.y + shortBox.height / 2);
await page.mouse.down();
await page.waitForTimeout(100);
await page.mouse.up();
await page.waitForFunction(() => document.querySelector(".app").classList.contains("phase-idle"));
assert.equal(await energy(), 0);
assert.equal(await page.locator(".win-dialog").isVisible(), false);
const full = await hold(1650);
assert.equal(full.released, 100);
assert.ok(full.finalRotation >= 1440);

await page.getByRole("button", { name: "HISTORY" }).click();
assert.equal(await page.locator(".history-list article").count(), 1);
await page.getByRole("button", { name: "Tutup history" }).click();

const box = await charge.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(100);
await charge.dispatchEvent("pointercancel");
await page.mouse.up();
assert.equal(await energy(), 0);
assert.match(await charge.innerText(), /HOLD TO CHARGE/);

for (const viewport of [
  { width: 320, height: 720 }, { width: 375, height: 812 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 768, height: 1024 }, { width: 1000, height: 900 },
  { width: 1280, height: 720 }, { width: 1366, height: 768 },
  { width: 1440, height: 900 }, { width: 1600, height: 900 },
  { width: 1920, height: 1080 }, { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
]) {
  await page.setViewportSize(viewport);
  const layout = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const visibleTitle = [...document.querySelectorAll(".title")].find((element) => getComputedStyle(element).display !== "none");
    const title = visibleTitle.getBoundingClientRect(), nav = rect("header nav"), brand = rect(".brand"), wheel = rect(".wheel-shell"), button = rect(".charge-button"), telemetry = rect(".telemetry");
    const matrix = new DOMMatrix(getComputedStyle(document.querySelector(".charge-button")).transform);
    return {
      titleLeft: title.left,
      titleRight: title.right,
      titleTop: title.top,
      titleBottom: title.bottom,
      navLeft: nav.left,
      navRight: nav.right,
      navTop: nav.top,
      navBottom: nav.bottom,
      brandRight: brand.right,
      brandLeft: brand.left,
      titleAlign: getComputedStyle(visibleTitle).textAlign,
      titleInTelemetry: visibleTitle.classList.contains("telemetry-title"),
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: document.documentElement.clientHeight,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      headerBottom: rect("header").bottom,
      wheelTop: wheel.top,
      chargeBottom: rect(".charge-button").bottom,
      modeBottom: rect(".control-bottom").bottom,
      telemetryLeft: telemetry.left,
      telemetryDisplay: getComputedStyle(document.querySelector(".telemetry")).display,
      energyBars: rect(".energy-bars").toJSON(),
      telemetry: telemetry.toJSON(),
      wheelCenter: wheel.left + wheel.width / 2,
      wheelWidth: wheel.width,
      wheelHeight: wheel.height,
      buttonCenter: button.left + button.width / 2,
      buttonHeight: button.height,
      tilt: Math.abs(matrix.b) + Math.abs(matrix.c),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert.equal(layout.titleAlign, "left");
  assert.ok(layout.titleLeft >= 0);
  assert.ok(layout.titleBottom <= layout.navTop || layout.titleTop >= layout.navBottom || layout.titleRight <= layout.navLeft || layout.titleLeft >= layout.navRight, `header title overlaps navigation at ${viewport.width}px`);
  assert.ok(layout.brandRight <= layout.navLeft || layout.brandLeft >= layout.navRight, `brand overlaps navigation at ${viewport.width}px`);
  assert.notEqual(layout.telemetryDisplay, "none");
  assert.ok(Math.abs(layout.wheelWidth - layout.wheelHeight) <= 1);
  assert.ok(layout.buttonHeight >= 60);
  assert.ok(layout.energyBars.left >= layout.telemetry.left - 1);
  assert.ok(layout.energyBars.right <= layout.telemetry.right + 1);
  assert.ok(Math.abs(layout.wheelCenter - layout.buttonCenter) <= 1.5, `wheel/button center mismatch at ${viewport.width}px: ${layout.wheelCenter} vs ${layout.buttonCenter}`);
  assert.ok(layout.wheelTop >= layout.headerBottom - 1);
  assert.ok(layout.documentWidth <= layout.viewportWidth, `horizontal overflow at ${viewport.width}px`);
  if (viewport.width >= 1280) {
    assert.equal(layout.titleInTelemetry, true);
    assert.ok(Math.abs(layout.titleLeft - layout.telemetryLeft) <= 1.5, `title is not aligned with Energy Level at ${viewport.width}px`);
    assert.ok(layout.documentHeight <= layout.viewportHeight, `vertical overflow at ${viewport.width}x${viewport.height}: ${layout.documentHeight}px`);
    assert.ok(layout.chargeBottom <= viewport.height + 1, `charge control clipped at ${viewport.width}x${viewport.height}`);
    assert.ok(layout.modeBottom <= viewport.height + 1, `no-hold option clipped at ${viewport.width}x${viewport.height}`);
  }
  assert.ok(layout.tilt < 0.001);
  assert.ok(layout.overflow <= 0);
}

await page.reload();
await page.setViewportSize({ width: 320, height: 720 });
await page.getByRole("button", { name: "HISTORY" }).click();
assert.equal(await page.locator(".history-list article").count(), 1);
const historyBounds = await page.locator(".history-dialog").boundingBox();
assert.ok(historyBounds);
assert.ok(historyBounds.x >= 0 && historyBounds.x + historyBounds.width <= 320);
assert.ok(historyBounds.y >= 0 && historyBounds.y + historyBounds.height <= 720);
assert.deepEqual(errors, []);
console.log("PASS: title aligned with Energy Level on desktop, 6-sector wheel, full-charge-only spin, and responsive layout at 320/375/390/430/768/1000/1280x720/1366x768/1440/1600x900/1920x1080/2560x1440/3840x2160; desktop/TV viewport fits with no scroll or console errors.");
await browser.close();
