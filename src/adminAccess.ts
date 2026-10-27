const SALT = "howell-spin-admin-v1";
const ITERATIONS = 150_000;
const REMEMBER_KEY = "howell-admin-remember-until";
const REMEMBER_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
// PBKDF2 verifier for the requested initial password. This is only a local UI
// lock on GitHub Pages; anyone who can inspect the bundle can bypass it.
const EXPECTED_HEX = "349d5bfcb87926cb579ce8bd71523aa8177c68014be5cd3d935845bfbd3118c4";

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyLocalAdminPassword(password: string): Promise<boolean> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(SALT),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    material,
    256,
  );
  return toHex(bits) === EXPECTED_HEX;
}

export function hasRememberedAdminAccess(storage: KeyValueStorage = localStorage): boolean {
  try {
    const expiresAt = Number(storage.getItem(REMEMBER_KEY));
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) return true;
    storage.removeItem(REMEMBER_KEY);
  } catch {
    // Storage may be unavailable in private browsing; fall back to session login.
  }
  return false;
}

export function rememberAdminAccess(
  remember: boolean,
  storage: KeyValueStorage = localStorage,
): void {
  try {
    if (remember) {
      storage.setItem(REMEMBER_KEY, String(Date.now() + REMEMBER_DURATION_MS));
    } else {
      storage.removeItem(REMEMBER_KEY);
    }
  } catch {
    // Do not block admin access if this browser cannot persist the preference.
  }
}

export function clearRememberedAdminAccess(storage: KeyValueStorage = localStorage): void {
  rememberAdminAccess(false, storage);
}
