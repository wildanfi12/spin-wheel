import { describe, expect, it } from "vitest";
import {
  clearRememberedAdminAccess,
  hasRememberedAdminAccess,
  rememberAdminAccess,
  verifyLocalAdminPassword,
} from "../src/adminAccess";

describe("local admin gate", () => {
  it.skipIf(!process.env.HOWELL_ADMIN_PASSWORD)("accepts the locally supplied admin password", async () => {
    const password = process.env.HOWELL_ADMIN_PASSWORD!;
    await expect(verifyLocalAdminPassword(password)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    await expect(verifyLocalAdminPassword("password-salah")).resolves.toBe(false);
  });

  it("remembers admin access for a limited time without storing a password", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    };

    rememberAdminAccess(true, storage);
    expect(hasRememberedAdminAccess(storage)).toBe(true);
    expect([...values.keys()]).toEqual(["howell-admin-remember-until"]);

    clearRememberedAdminAccess(storage);
    expect(hasRememberedAdminAccess(storage)).toBe(false);
  });
});
