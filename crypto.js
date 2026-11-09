// Password-protected backups: PBKDF2-SHA256 -> AES-GCM-256 (Web Crypto API).
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64 = (buf) => {
  const a = new Uint8Array(buf); let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
};
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pw, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(obj, password, iter = 250000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iter);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { app: 'car-collection', v: 1, enc: 'aes-gcm', kdf: 'pbkdf2-sha256', iter, salt: b64(salt), iv: b64(iv), data: b64(ct) };
}

export async function decryptJSON(env, password) {
  const key = await deriveKey(password, unb64(env.salt), env.iter);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data));
  return JSON.parse(dec.decode(pt));
}

/** Salted hash for the optional app PIN (a screen lock, not strong protection). */
export async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`${salt}:${pin}`));
  return b64(buf);
}
export const randomSalt = () => b64(crypto.getRandomValues(new Uint8Array(12)));
