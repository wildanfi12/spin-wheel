const SALT = "howell-spin-admin-v1";
const ITERATIONS = 150_000;
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
