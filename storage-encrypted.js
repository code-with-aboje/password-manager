// storage-encrypted.js
// Minimal encrypted IndexedDB storage helpers (illustrative).
// IMPORTANT: This example uses Web Crypto APIs. Review and security-audit before production.

const DB_NAME = 'pwdmgr-db';
const STORE_NAME = 'entries';

// Derive AES-GCM key using PBKDF2 from user's master password.
// If salt is not provided, a new random salt is returned with the key.
async function deriveKeyFromPassword(password, salt = null) {
  const enc = new TextEncoder();
  const saltBytes = salt ? new Uint8Array(salt) : crypto.getRandomValues(new Uint8Array(16));
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 200000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return { key, salt: Array.from(saltBytes) };
}

async function encryptData(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext))
  };
}

async function decryptData(key, payload) {
  const iv = new Uint8Array(payload.iv);
  const cipher = new Uint8Array(payload.ciphertext).buffer;
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plaintext));
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveEntry(password, entryObject) {
  const { key, salt } = await deriveKeyFromPassword(password);
  const payload = await encryptData(key, entryObject);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add({ salt, payload, createdAt: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllEntries(password) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = async () => {
      try {
        const arr = [];
        for (const row of req.result) {
          const { salt, payload, id } = row;
          const { key } = await deriveKeyFromPassword(password, salt);
          const clear = await decryptData(key, payload);
          arr.push({ id, ...clear });
        }
        resolve(arr);
      } catch (e) {
        reject(e);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// Export helpers (ES module style)
export { saveEntry, getAllEntries, deriveKeyFromPassword };