import { type Address, type Hex, encodeAbiParameters, encodeFunctionData, getContractAddress, keccak256, pad, concat } from "viem";

/**
 * Helpers for computing counterfactual YieldPilotAccount addresses and the
 * `initCode` blob that deploys + initialises the account on first UserOp.
 *
 * Address derivation matches OpenZeppelin Clones.cloneDeterministic:
 *   finalSalt = keccak256(abi.encode(pubKeyX, pubKeyY, salt))
 *   proxyBytecode = ERC-1167 minimal proxy pointing at accountImplementation
 *   address = keccak256(0xff ++ factory ++ finalSalt ++ keccak256(proxyBytecode))[12:]
 *
 * `credId` and `nickname` are passed to `initialize` as metadata but do NOT
 * influence the CREATE2 address — the account stays at the same address even
 * after `addAuthorizedKey` registers additional passkeys.
 */

/** ERC-1167 minimal proxy template. `<impl>` is a 20-byte placeholder. */
const CLONE_PREFIX = "0x3d602d80600a3d3981f3363d3d373d3d3d363d73" as const;
const CLONE_SUFFIX = "5af43d82803e903d91602b57fd5bf3" as const;

function minimalProxyCode(impl: Address): Hex {
  return (CLONE_PREFIX + impl.slice(2).toLowerCase() + CLONE_SUFFIX) as Hex;
}

export function finalSalt(pubKeyX: Hex, pubKeyY: Hex, salt: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
      [pubKeyX as `0x${string}`, pubKeyY as `0x${string}`, salt],
    ),
  );
}

export function counterfactualAddress(args: {
  factory: Address;
  accountImpl: Address;
  pubKeyX: Hex;
  pubKeyY: Hex;
  salt?: bigint;
}): Address {
  const salt = args.salt ?? 0n;
  const codeHash = keccak256(minimalProxyCode(args.accountImpl));
  const fSalt = finalSalt(args.pubKeyX, args.pubKeyY, salt);
  return getContractAddress({
    opcode: "CREATE2",
    from: args.factory,
    salt: fSalt,
    bytecodeHash: codeHash,
  });
}

/** ABI-encoded `factory.createAccount(credId, pubKeyX, pubKeyY, nickname, salt)` calldata. */
export function createAccountCalldata(
  credIdHash: Hex,
  pubKeyX: Hex,
  pubKeyY: Hex,
  nickname: Hex,
  salt: bigint,
): Hex {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "createAccount",
        inputs: [
          { name: "credId", type: "bytes32" },
          { name: "pubKeyX", type: "bytes32" },
          { name: "pubKeyY", type: "bytes32" },
          { name: "nickname", type: "bytes32" },
          { name: "salt", type: "uint256" },
        ],
        outputs: [{ type: "address" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "createAccount",
    args: [
      credIdHash as `0x${string}`,
      pubKeyX as `0x${string}`,
      pubKeyY as `0x${string}`,
      nickname as `0x${string}`,
      salt,
    ],
  });
}

/** Full `initCode` blob (factory address ++ createAccount calldata). */
export function buildInitCode(args: {
  factory: Address;
  credIdHash: Hex;
  pubKeyX: Hex;
  pubKeyY: Hex;
  nickname?: Hex;
  salt?: bigint;
}): Hex {
  const salt = args.salt ?? 0n;
  const nickname = args.nickname ?? (("0x" + "00".repeat(32)) as Hex);
  return concat([
    args.factory,
    createAccountCalldata(args.credIdHash, args.pubKeyX, args.pubKeyY, nickname, salt),
  ]);
}

/** `account.execute(target, value, data)` calldata. */
export function executeCalldata(target: Address, value: bigint, data: Hex): Hex {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "execute",
        inputs: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "execute",
    args: [target, value, data],
  });
}

/** `account.addAuthorizedKey(credId, x, y, nickname)` calldata. */
export function addAuthorizedKeyCalldata(
  credIdHash: Hex,
  pubKeyX: Hex,
  pubKeyY: Hex,
  nickname: Hex,
): Hex {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "addAuthorizedKey",
        inputs: [
          { name: "credId", type: "bytes32" },
          { name: "x", type: "bytes32" },
          { name: "y", type: "bytes32" },
          { name: "nickname", type: "bytes32" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "addAuthorizedKey",
    args: [
      credIdHash as `0x${string}`,
      pubKeyX as `0x${string}`,
      pubKeyY as `0x${string}`,
      nickname as `0x${string}`,
    ],
  });
}

/** `account.revokeKey(credId)` calldata. */
export function revokeKeyCalldata(credIdHash: Hex): Hex {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "revokeKey",
        inputs: [{ name: "credId", type: "bytes32" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "revokeKey",
    args: [credIdHash as `0x${string}`],
  });
}

/**
 * Encode the passkey signature envelope the YieldPilotAccount decodes.
 * Five fields — credId routes to the stored key, then the WebAuthn assertion.
 */
export function encodePasskeySignature(args: {
  credIdHash: Hex;
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  r: Hex;
  s: Hex;
}): Hex {
  const authData = ("0x" + bytesToHex(args.authenticatorData)) as Hex;
  const clientData = ("0x" + bytesToHex(args.clientDataJSON)) as Hex;
  return encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "bytes" },
      { type: "bytes" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
    [
      args.credIdHash as `0x${string}`,
      authData,
      clientData,
      args.r as `0x${string}`,
      args.s as `0x${string}`,
    ],
  );
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Pack uint128 + uint128 into a single bytes32 (ERC-4337 v0.7 encoding). */
export function packAccountGasLimits(verificationGasLimit: bigint, callGasLimit: bigint): Hex {
  return (pad(`0x${verificationGasLimit.toString(16)}`, { size: 16, dir: "left" }) +
    pad(`0x${callGasLimit.toString(16)}`, { size: 16, dir: "left" }).slice(2)) as Hex;
}

export function packGasFees(maxPriorityFeePerGas: bigint, maxFeePerGas: bigint): Hex {
  return (pad(`0x${maxPriorityFeePerGas.toString(16)}`, { size: 16, dir: "left" }) +
    pad(`0x${maxFeePerGas.toString(16)}`, { size: 16, dir: "left" }).slice(2)) as Hex;
}

/** Encode an arbitrary string as a bytes32 label (truncated/padded). */
export function stringToBytes32(label: string | undefined): Hex {
  if (!label) return ("0x" + "00".repeat(32)) as Hex;
  const enc = new TextEncoder().encode(label).slice(0, 32);
  const hex = Array.from(enc, (b) => b.toString(16).padStart(2, "0")).join("");
  return ("0x" + hex.padEnd(64, "0")) as Hex;
}

export function bytes32ToString(label: Hex | undefined): string {
  if (!label || label === "0x") return "";
  const bytes: number[] = [];
  for (let i = 2; i < label.length; i += 2) {
    const b = parseInt(label.slice(i, i + 2), 16);
    if (b === 0) break;
    bytes.push(b);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}
