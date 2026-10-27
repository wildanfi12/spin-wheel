import { describe, expect, it } from "vitest";
import { verifyLocalAdminPassword } from "../src/adminAccess";

describe("local admin gate", () => {
  it.skipIf(!process.env.HOWELL_ADMIN_PASSWORD)("accepts the locally supplied admin password", async () => {
    const password = process.env.HOWELL_ADMIN_PASSWORD!;
    await expect(verifyLocalAdminPassword(password)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    await expect(verifyLocalAdminPassword("password-salah")).resolves.toBe(false);
  });
});
