"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { bytesToHex, hexToBytes, keccak256, type Hex } from "viem";

// P-256 curve order n — used to detect / normalise "low-s" signatures.
const P256_N =
  0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const P256_N_HALF = P256_N / 2n;

/**
 * Passkey (WebAuthn) helpers for the DIY ERC-4337 smart-account flow.
 *
 * Registration ────────────────────────────────────────────────────────────
 * navigator.credentials.create() produces an attestation containing the
 * authenticator's public key (a COSE-encoded P-256 point). We extract the
 * x/y coordinates and persist them alongside the credential ID in IndexedDB.
 *
 * Authentication ───────────────────────────────────────────────────────────
 * navigator.credentials.get() returns (authenticatorData, clientDataJSON, sig).
 * The signature is ASN.1-DER-encoded; our Solidity contract wants r and s as
 * raw 32-byte values. We decode the DER blob + ABI-encode five fields
 * (credIdHash + authData + clientDataJSON + r + s) for the
 * `YieldPilotAccount._validateSignature` decoder.
 */

export interface PasskeyRecord {
  /** base64url credentialId — what WebAuthn returns. */
  credentialId: string;
  /** keccak256 of the decoded credentialId bytes — routing key for the on-chain
   *  `keys[credId]` mapping. Stored redundantly so we don't re-hash on every use. */
  credIdHash: Hex;
  pubKeyX: Hex;
  pubKeyY: Hex;
  /** Optional user-supplied label (e.g. "MacBook · Safari"). Empty string = unset. */
  nickname: string;
  createdAt: number;
  /** Address of the smart account this passkey signs for. Set for paired
   *  devices — Browser B's passkey signs Browser A's account, so the
   *  counterfactual derivation off this record's (x, y) would give the wrong
   *  address. Omitted for primary devices (account address = counterfactual). */
  accountAddress?: `0x${string}`;
}

const DB_NAME = "yield-pilot-passkey";
const STORE_NAME = "credentials";
const RECORD_KEY = "primary";

// ──────────────────────────── IndexedDB helpers ───────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

export async function loadPasskey(): Promise<PasskeyRecord | null> {
  const db = await openDb();
  const raw: PasskeyRecord | null = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as PasskeyRecord | undefined) ?? null);
  });
  if (!raw) return null;

  // Migration: backfill credIdHash + nickname for records created before the
  // multi-key contract migration. Existing users keep their passkey intact.
  if (!raw.credIdHash || !("nickname" in raw)) {
    const patched: PasskeyRecord = {
      ...raw,
      credIdHash: raw.credIdHash ?? computeCredIdHash(raw.credentialId),
      nickname: raw.nickname ?? "",
    };
    await savePasskey(patched);
    return patched;
  }
  return raw;
}

export async function savePasskey(record: PasskeyRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearPasskey(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─────────────────────────────── Registration ──────────────────────────────

export interface RegisterOptions {
  rpId?: string;         // defaults to current hostname
  rpName?: string;       // defaults to "YieldPilot"
  userName?: string;     // defaults to "YieldPilot user"
  /** Persist the record to IndexedDB on success. Default: true.
   *  Set false to register a passkey without overwriting an existing primary record
   *  — useful for the pairing flow where we're registering Browser B's passkey
   *  but it should not become the primary until Browser A approves the on-chain op. */
  persist?: boolean;
  nickname?: string;
}

/** Generate a passkey + return the extracted public key. */
export async function registerPasskey(opts: RegisterOptions = {}): Promise<PasskeyRecord> {
  const rpId = opts.rpId ?? (typeof window !== "undefined" ? window.location.hostname : "localhost");
  const rpName = opts.rpName ?? "YieldPilot";
  const userName = opts.userName ?? "YieldPilot user";
  const persist = opts.persist ?? true;

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = crypto.getRandomValues(new Uint8Array(16));

  const attestation = await startRegistration({
    optionsJSON: {
      rp: { id: rpId, name: rpName },
      user: {
        id: base64url(userIdBytes),
        name: userName,
        displayName: userName,
      },
      challenge: base64url(challenge),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256 (P-256)
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      attestation: "none",
      timeout: 60_000,
    },
  });

  const { x, y } = extractP256PubKey(attestation.response.attestationObject);

  const record: PasskeyRecord = {
    credentialId: attestation.id, // already base64url
    credIdHash: computeCredIdHash(attestation.id),
    pubKeyX: bytesToHex(x),
    pubKeyY: bytesToHex(y),
    nickname: opts.nickname ?? "",
    createdAt: Date.now(),
  };
  if (persist) await savePasskey(record);
  return record;
}

/** keccak256 of the raw (base64url-decoded) credentialId bytes. */
export function computeCredIdHash(credentialIdBase64Url: string): Hex {
  const bytes = base64urlDecode(credentialIdBase64Url);
  return keccak256(bytes);
}

// ────────────────────────── Authentication / signing ──────────────────────

export interface SignedUserOp {
  /** Routing id — the on-chain `keys[credId]` lookup. */
  credIdHash: Hex;
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  r: Hex;
  s: Hex;
}

/**
 * Ask the user's authenticator to sign `userOpHash`. Returns all five pieces
 * we need for the on-chain `_validateSignature` decoder.
 */
export async function signUserOpHash(
  credentialId: string,
  userOpHash: Hex,
  rpId?: string,
): Promise<SignedUserOp> {
  const challengeBytes = hexToBytes(userOpHash);
  const resolvedRpId = rpId ?? (typeof window !== "undefined" ? window.location.hostname : "localhost");

  const assertion = await startAuthentication({
    optionsJSON: {
      challenge: base64url(challengeBytes),
      allowCredentials: [{ id: credentialId, type: "public-key" }],
      rpId: resolvedRpId,
      userVerification: "preferred",
      timeout: 60_000,
    },
  });

  const authData = base64urlDecode(assertion.response.authenticatorData);
  const clientDataJSON = base64urlDecode(assertion.response.clientDataJSON);
  const sigDer = base64urlDecode(assertion.response.signature);
  const { r, s } = derToRs(sigDer);

  return {
    credIdHash: computeCredIdHash(credentialId),
    authenticatorData: authData,
    clientDataJSON,
    r: ("0x" + padHex(r, 32)) as Hex,
    s: ("0x" + padHex(s, 32)) as Hex,
  };
}

// ────────────────────────────── COSE + DER parsing ─────────────────────────

/**
 * Extract the (x, y) P-256 public key from a WebAuthn attestationObject.
 * attestationObject is a CBOR-encoded map { fmt, attStmt, authData }.
 * authData layout (after rpIdHash/flags/signCount) contains the
 * credentialPublicKey — a COSE_Key map with labels {1,3,-1,-2,-3}.
 */
export function extractP256PubKey(attestationObjectB64: string): { x: Uint8Array; y: Uint8Array } {
  const attestationBytes = base64urlDecode(attestationObjectB64);
  const { authData } = decodeCbor(attestationBytes) as { authData: Uint8Array };

  // authData: rpIdHash(32) | flags(1) | signCount(4) | attestedCredentialData(...)
  // attestedCredentialData: aaguid(16) | credIdLen(2) | credId(L) | credPublicKey(CBOR)
  let offset = 32 + 1 + 4 + 16;
  const credIdLen = (authData[offset]! << 8) | authData[offset + 1]!;
  offset += 2 + credIdLen;

  const coseKeyBytes = authData.slice(offset);
  const coseKey = decodeCbor(coseKeyBytes) as Record<number, number | Uint8Array>;
  const x = coseKey[-2] as Uint8Array;
  const y = coseKey[-3] as Uint8Array;
  if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
    throw new Error("COSE key missing x / y coordinates");
  }
  return { x, y };
}

/** Decode an ASN.1-DER ECDSA signature into raw r, s (big-endian) components. */
export function derToRs(der: Uint8Array): { r: Uint8Array; s: Uint8Array } {
  // DER layout: 0x30 LEN 0x02 Lr R 0x02 Ls S
  if (der[0] !== 0x30) throw new Error("bad DER signature");
  let off = 2;
  if (der[off] !== 0x02) throw new Error("bad DER r");
  const rLen = der[off + 1]!;
  off += 2;
  let r: Uint8Array = copyBytes(der.slice(off, off + rLen));
  off += rLen;
  if (der[off] !== 0x02) throw new Error("bad DER s");
  const sLen = der[off + 1]!;
  off += 2;
  let s: Uint8Array = copyBytes(der.slice(off, off + sLen));

  // Strip leading zero pads (added when high bit would otherwise flip sign).
  if (r.length > 32) r = copyBytes(r.slice(r.length - 32));
  if (s.length > 32) s = copyBytes(s.slice(s.length - 32));

  // Low-s normalisation — some contracts / precompiles accept any s;
  // RIP-7212 accepts both. We normalise to be safe.
  const sBig = bytesToBig(s);
  if (sBig > P256_N_HALF) {
    s = bigToBytes(P256_N - sBig);
  }
  return { r, s };
}

function copyBytes(src: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(src.length);
  out.set(src as unknown as Uint8Array);
  return out;
}

// ────────────────────────── Encoding helpers ──────────────────────────────

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function padHex(bytes: Uint8Array, target: number): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return hex.padStart(target * 2, "0");
}

function bytesToBig(b: Uint8Array): bigint {
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  return v;
}

function bigToBytes(v: bigint): Uint8Array {
  const hex = v.toString(16).padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// ───────────────────────── Minimal CBOR decoder ───────────────────────────
//
// Supports the subset WebAuthn uses: maps (with integer + negative-integer
// keys), byte strings, text strings, ints. Not a general CBOR library.

function decodeCbor(buf: Uint8Array): unknown {
  const state = { data: buf, pos: 0 };
  return decodeItem(state);
}

function decodeItem(state: { data: Uint8Array; pos: number }): unknown {
  const byte = state.data[state.pos++];
  if (byte === undefined) throw new Error("CBOR truncated");
  const major = byte >> 5;
  const info = byte & 0x1f;
  const len = readLength(state, info);

  switch (major) {
    case 0:
      return Number(len);
    case 1:
      return -1 - Number(len);
    case 2: {
      const bytes = state.data.slice(state.pos, state.pos + Number(len));
      state.pos += Number(len);
      return bytes;
    }
    case 3: {
      const bytes = state.data.slice(state.pos, state.pos + Number(len));
      state.pos += Number(len);
      return new TextDecoder().decode(bytes);
    }
    case 4: {
      const arr: unknown[] = [];
      for (let i = 0; i < Number(len); i++) arr.push(decodeItem(state));
      return arr;
    }
    case 5: {
      const map: Record<string | number, unknown> = {};
      for (let i = 0; i < Number(len); i++) {
        const k = decodeItem(state);
        const v = decodeItem(state);
        map[k as string | number] = v;
      }
      return map;
    }
    default:
      throw new Error(`unsupported CBOR major ${major}`);
  }
}

function readLength(state: { data: Uint8Array; pos: number }, info: number): bigint {
  if (info < 24) return BigInt(info);
  if (info === 24) return BigInt(state.data[state.pos++]!);
  if (info === 25) {
    const v = (state.data[state.pos]! << 8) | state.data[state.pos + 1]!;
    state.pos += 2;
    return BigInt(v);
  }
  if (info === 26) {
    const v =
      (state.data[state.pos]! << 24) |
      (state.data[state.pos + 1]! << 16) |
      (state.data[state.pos + 2]! << 8) |
      state.data[state.pos + 3]!;
    state.pos += 4;
    return BigInt(v >>> 0);
  }
  throw new Error(`unsupported CBOR length info ${info}`);
}
