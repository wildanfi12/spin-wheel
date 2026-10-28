import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const adminPassword = process.env.HOWELL_ADMIN_PASSWORD;
assert.ok(adminPassword, "Set HOWELL_ADMIN_PASSWORD to exercise the local admin gate.");
async function loginToAdmin({ remember = false } = {}) {
  if (!(await page.locator("#admin-password").isVisible())) return;
  if (remember)
    await page.getByLabel("Ingat saya selama 30 hari di perangkat ini").check();
  await page.locator("#admin-password").fill(adminPassword);
  await page.getByRole("button", { name: "MASUK" }).click();
  await page.locator(".inventory-table tbody tr").first().waitFor();
}
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(process.env.SPIN_WHEEL_URL || "http://127.0.0.1:5173/spin-wheel/");
await page.locator(".wheel-disc path").first().waitFor();
assert.equal(
  await page.getByRole("button", { name: "Matikan suara" }).getAttribute("aria-pressed"),
  "true",
);
assert.equal(await page.locator(".wheel-disc path").count(), 6);
const charge = page.locator(".charge-button");
await charge.waitFor();
await page.waitForFunction(
  () => !document.querySelector(".charge-button").disabled,
);
await page.screenshot({ path: "../desktop-preview.png", fullPage: true });
await page.getByRole("button", { name: "HISTORY" }).click();
assert.match(
  await page.locator(".history-dialog").innerText(),
  /Belum ada putaran/,
);
await page.getByRole("button", { name: "Tutup history" }).click();
const box = await charge.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(400);
await page.mouse.up();
assert.match(await charge.innerText(), /HOLD TO CHARGE/);
await page.mouse.down();
await page.waitForTimeout(1800);
assert.match(await charge.innerText(), /RELEASE TO SPIN/);
await page.waitForTimeout(300);
assert.equal(await page.locator(".win-dialog").isVisible(), false);
await page.mouse.up();
await page.waitForTimeout(7300);
assert.equal(await page.locator(".win-dialog").isVisible(), true);
const saved = await page.evaluate(async () => {
  const d = await new Promise((res, rej) => {
    const r = indexedDB.open("howell-booth", 1);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return await new Promise((res) => {
    const r = d.transaction("app").objectStore("app").get("state");
    r.onsuccess = () => res(r.result);
  });
});
assert.equal(saved.spins.length, 1);
const r = saved.spins[0];
const angle = await page
  .locator(".wheel-disc")
  .evaluate((el) => Number(el.style.transform.match(/rotate\((.*)deg\)/)[1]));
assert.equal(Math.round(((360 - (angle % 360)) % 360) / 60) % 6, r.segment);
await page.screenshot({ path: "../winning-preview.png", fullPage: true });
await page.getByRole("button", { name: "SELESAI" }).click();
await page.waitForFunction(() =>
  document.querySelector(".app").classList.contains("phase-idle"),
);
const testSpinStart = Date.now();
const beforeTestTransform = await page.locator(".wheel-disc").getAttribute("style");
await page.getByRole("button", { name: "Test spin" }).click();
await page.waitForFunction(
  (previous) => document.querySelector(".wheel-disc").getAttribute("style") !== previous,
  beforeTestTransform,
  { timeout: 500 },
);
await page.locator(".win-dialog").waitFor({ timeout: 5000 });
assert.ok(Date.now() - testSpinStart < 4500, "test spin should animate immediately without reading history");
const historyAfterTest = await page.evaluate(async () => {
  const d = await new Promise((res, rej) => {
    const r = indexedDB.open("howell-booth", 1);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return await new Promise((res) => {
    const r = d.transaction("app").objectStore("app").get("state");
    r.onsuccess = () => res(r.result.spins.length);
  });
});
assert.equal(historyAfterTest, 1, "test spin must not add to production history");
await page.getByRole("button", { name: "SELESAI" }).click();
await page.waitForFunction(() =>
  document.querySelector(".app").classList.contains("phase-idle"),
);
await page.getByRole("button", { name: "ADMIN" }).click();
await page.locator(".admin-dialog").waitFor({ state: "visible" });
await loginToAdmin({ remember: true });
assert.equal(await page.locator(".inventory-table tbody tr").count(), 6);
assert.match(await page.locator(".admin-dialog").innerText(), /Stok Hadiah Harian/);
await page.getByRole("button", { name: "Tutup dashboard" }).click();
await page.reload();
await page.getByRole("button", { name: "ADMIN" }).click();
await page.locator(".inventory-table tbody tr").first().waitFor();
assert.equal(await page.locator("#admin-password").count(), 0);
await page.getByRole("button", { name: "Tutup dashboard" }).click();
await page.getByRole("button", { name: "HISTORY" }).click();
assert.match(
  await page.locator(".history-dialog").innerText(),
  new RegExp(r.code),
);
await page.getByRole("button", { name: "Tutup history" }).click();
await charge.focus();
await page.keyboard.down("Space");
await page.waitForTimeout(1700);
await charge.dispatchEvent("pointercancel");
await page.keyboard.up("Space");
assert.match(await charge.innerText(), /HOLD TO CHARGE/);
await page.getByLabel("Mode tanpa tahan").check();
const noHoldStart = Date.now();
const beforeNoHoldTransform = await page.locator(".wheel-disc").getAttribute("style");
await charge.click();
await page.waitForFunction(
  (previous) => document.querySelector(".wheel-disc").getAttribute("style") !== previous,
  beforeNoHoldTransform,
  { timeout: 500 },
);
await page.locator(".win-dialog").waitFor({ timeout: 6000 });
assert.ok(Date.now() - noHoldStart < 5000, "no-hold mode should start and finish without a charging wait");
await page.getByRole("button", { name: "SELESAI" }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "../mobile-preview.png", fullPage: true });
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  true,
);
const wheel = await page.locator(".wheel-shell").boundingBox();
assert.ok(wheel.x >= 0 && wheel.x + wheel.width <= 390);
await page.getByRole("button", { name: "ADMIN" }).click();
await page.locator(".admin-dialog").waitFor({ state: "visible" });
await loginToAdmin();
assert.equal(await page.locator(".inventory-table tbody tr").count(), 6);
await page.getByRole("button", { name: "Tutup dashboard" }).click();
await page.getByRole("button", { name: "HISTORY" }).click();
await page.screenshot({ path: "../history-preview.png", fullPage: true });
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "EXPORT CSV" }).click();
const download = await downloadPromise;
assert.equal(download.suggestedFilename(), "howell-history.csv");
await page.getByRole("button", { name: "Tutup history" }).click();
await page.getByLabel("Mode tanpa tahan").uncheck();
const mobileButton = await charge.boundingBox();
await page.mouse.move(mobileButton.x + mobileButton.width / 2, mobileButton.y + mobileButton.height / 2);
await page.mouse.down();
await page.waitForTimeout(1700);
await charge.dispatchEvent("lostpointercapture", { pointerId: 1 });
await page.mouse.up();
assert.match(await charge.innerText(), /HOLD TO CHARGE/);
await charge.focus();
await page.keyboard.down("Enter");
await page.waitForTimeout(1700);
assert.match(await charge.innerText(), /RELEASE TO SPIN/);
await page.keyboard.up("Enter");
await page.waitForTimeout(7300);
assert.equal(await page.locator(".win-dialog").isVisible(), true);
await page.getByRole("button", { name: "SELESAI" }).click();
const officialSpinCount = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("howell-booth", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return await new Promise((resolve) => {
    const request = db.transaction("app").objectStore("app").get("state");
    request.onsuccess = () => resolve(request.result.spins.length);
  });
});
await page.getByRole("button", { name: "Test spin" }).click();
await page.waitForTimeout(6000);
assert.equal(await page.getByRole("heading", { name: "TEST SPIN" }).isVisible(), true);
await page.getByRole("button", { name: "SELESAI" }).click();
const spinsAfterTest = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("howell-booth", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return await new Promise((resolve) => {
    const request = db.transaction("app").objectStore("app").get("state");
    request.onsuccess = () => resolve(request.result.spins.length);
  });
});
assert.equal(spinsAfterTest, officialSpinCount);
assert.deepEqual(errors, []);
console.log(
  "PASS: spin behavior, result and history, local admin gate, direct no-history test spin, keyboard cancellation, accessible two-tap, 390px layout, console.",
);
await browser.close();

