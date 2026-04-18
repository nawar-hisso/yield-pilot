import { type Address, type Hex, encodeAbiParameters, encodeFunctionData, getContractAddress, keccak256, pad, concat } from "viem";

/**
 * Helpers for computing counterfactual YieldPilotAccount addresses and the
 * `initCode` blob that deploys + initialises the account on first UserOp.
 *
 * Address derivation matches OpenZeppelin Clones.cloneDeterministic:
 *   finalSalt = keccak256(abi.encode(pubKeyX, pubKeyY, salt))
 *   proxyBytecode = ERC-1167 minimal proxy pointing at accountImplementation
 *   address = keccak256(0xff ++ factory ++ finalSalt ++ keccak256(proxyBytecode))[12:]
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

/** ABI-encoded `factory.createAccount(pubKeyX, pubKeyY, salt)` calldata. */
export function createAccountCalldata(pubKeyX: Hex, pubKeyY: Hex, salt: bigint): Hex {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "createAccount",
        inputs: [
          { name: "pubKeyX", type: "bytes32" },
          { name: "pubKeyY", type: "bytes32" },
          { name: "salt", type: "uint256" },
        ],
        outputs: [{ type: "address" }],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "createAccount",
    args: [pubKeyX as `0x${string}`, pubKeyY as `0x${string}`, salt],
  });
}

/** Full `initCode` blob (factory address ++ createAccount calldata). */
export function buildInitCode(args: {
  factory: Address;
  pubKeyX: Hex;
  pubKeyY: Hex;
  salt?: bigint;
}): Hex {
  const salt = args.salt ?? 0n;
  return concat([args.factory, createAccountCalldata(args.pubKeyX, args.pubKeyY, salt)]);
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

/** Encode the passkey signature blob our YieldPilotAccount decodes. */
export function encodePasskeySignature(args: {
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  r: Hex;
  s: Hex;
}): Hex {
  const authData = ("0x" + bytesToHex(args.authenticatorData)) as Hex;
  const clientData = ("0x" + bytesToHex(args.clientDataJSON)) as Hex;
  return encodeAbiParameters(
    [
      { type: "bytes" },
      { type: "bytes" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
    [authData, clientData, args.r as `0x${string}`, args.s as `0x${string}`],
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
