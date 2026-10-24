import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "msedge", headless: true });
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
assert.equal(await page.locator(".wheel-disc .segment-icon").count(), 9);

const energy = () => page.locator(".energy-number").evaluate((node) => parseInt(node.textContent, 10));
const rotation = () => page.locator(".wheel-disc").evaluate((node) => Number(node.style.transform.match(/rotate\((.*)deg\)/)?.[1] || 0));
const pointerIndex = (angle) => Math.round(((360 - (angle % 360)) % 360) / 30) % 12;

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

const low = await hold(75);
assert.ok(low.released >= 3 && low.released <= 10, `5% release read ${low.released}%`);
assert.ok(low.finalRotation >= 30, `low rotation ${low.finalRotation}deg`);
const twenty = await hold(300);
assert.ok(twenty.released >= 17 && twenty.released <= 25, `20% release read ${twenty.released}%`);
assert.ok(twenty.released < 100);
const medium = await hold(750);
assert.ok(medium.released >= 47 && medium.released <= 55, `50% release read ${medium.released}%`);
const full = await hold(1650);
assert.equal(full.released, 100);
assert.ok(full.finalRotation >= 1440);

for (let i = 4; i < 10; i++) await hold(90 + i * 10);
await page.getByRole("button", { name: "HISTORY" }).click();
assert.equal(await page.locator(".history-list article").count(), 10);
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
  { width: 1920, height: 1080 }, { width: 1366, height: 768 },
  { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 800 },
]) {
  await page.setViewportSize(viewport);
  const layout = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const title = rect(".title"), wheel = rect(".wheel-shell"), button = rect(".charge-button");
    const matrix = new DOMMatrix(getComputedStyle(document.querySelector(".charge-button")).transform);
    return {
      titleLeft: title.left,
      titleAlign: getComputedStyle(document.querySelector(".title")).textAlign,
      wheelCenter: wheel.left + wheel.width / 2,
      buttonCenter: button.left + button.width / 2,
      tilt: Math.abs(matrix.b) + Math.abs(matrix.c),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  assert.equal(layout.titleAlign, "left");
  assert.ok(layout.titleLeft >= 0 && layout.titleLeft < viewport.width / 2);
  assert.ok(Math.abs(layout.wheelCenter - layout.buttonCenter) <= 1.5);
  assert.ok(layout.tilt < 0.001);
  assert.ok(layout.overflow <= 0);
}

await page.reload();
await page.getByRole("button", { name: "HISTORY" }).click();
assert.equal(await page.locator(".history-list article").count(), 10);
assert.deepEqual(errors, []);
console.log("PASS: accurate 5/20/50/100% power, pointer result, 10 repeat spins, reset, history persistence, cancel, responsive centering, no overflow or console errors.");
await browser.close();
