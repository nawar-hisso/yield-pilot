# YieldPilot — Contracts

> Authoritative specification for Phase 1 (smart contracts). Every function signature, storage slot, event, and invariant listed here is the blueprint the executor implements. Do not deviate without updating this doc.

---

## 1. Overview


```
User EOA / Smart Account
        │
        │ deposit(assets, receiver)
        ▼
  ┌─────────────┐   deployToStrategy()    ┌─────────────┐
  │  YieldVault │ ──────────────────────► │  MockAave   │
  │  (ERC-4626) │ ◄────────────────────── │  (lending)  │
  └──────┬──────┘   recallFromStrategy()  └─────────────┘
         │ totalAssets() includes MockAave balance
         │
  ┌──────▼──────────────────────────────────────────────┐
  │                  ERC-4337 path (gasless)             │
  │  UserOp ──► EntryPoint ──► Paymaster.validatePaymasterUserOp
  │                                  │ postOp → recordSponsorship
  └─────────────────────────────────┘
         │
  ┌──────▼──────┐  execTransactionFromModule()  ┌──────────────────┐
  └──────┬──────┘                               └──────────────────┘
         │ checkTransaction() (every tx)
         ▼
  ┌─────────────┐
  └─────────────┘
```

---

## 2. Contract Specifications

### 2.1 YieldVault

**Purpose.** Tokenised ERC-4626 vault that accepts MockUSDC deposits, mints `yvUSDC` shares, and routes idle capital to MockAave to accrue simulated yield.

#### Inheritance chain

```
YieldVault
  ├── @openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol  (ERC4626 → ERC20)
  ├── @openzeppelin/contracts/access/Ownable.sol
  ├── @openzeppelin/contracts/utils/ReentrancyGuard.sol
  └── contracts/interfaces/IYieldVault.sol
```

#### Storage layout

| Slot (logical) | Type | Name | Notes |
|---|---|---|---|
| inherited (ERC20) | `string` | `_name` | "YieldPilot USDC" |
| inherited (ERC20) | `string` | `_symbol` | "yvUSDC" |
| inherited (ERC4626) | `IERC20` | `_asset` | MockUSDC address |
| immutable | `IMockAave` | `strategy` | Set at construction, never changed |

No mutable admin storage beyond `Ownable._owner`. Upgradeability not in scope for MVP — add a UUPS proxy here when graduate to production.

#### External functions

```solidity
// ── Inherited from ERC4626 (implement via OZ; NatSpec here for completeness) ──

/// @notice Deposit `assets` of underlying, mint shares to `receiver`.
/// @dev Caller must have approved this contract for `assets` of the underlying
///      token. Emits ERC-4626 Deposit event. Protected by ReentrancyGuard via
///      OZ's _deposit hook.
/// @param assets Amount of MockUSDC (6 decimals) to deposit.
/// @param receiver Address to credit yvUSDC shares to.
/// @return shares Number of yvUSDC shares minted.
function deposit(uint256 assets, address receiver) external returns (uint256 shares);

/// @notice Withdraw `assets` of underlying by burning the required shares from `owner`.
/// @dev `msg.sender` must have allowance over `owner`'s shares unless msg.sender == owner.
/// @param assets Amount of MockUSDC to withdraw.
/// @param receiver Address to send underlying tokens to.
/// @param owner  Address whose shares are burned.
/// @return shares Number of yvUSDC shares burned.
function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);

/// @notice Burn exactly `shares` from `owner` and send proportional assets to `receiver`.
/// @param shares Number of yvUSDC shares to redeem.
/// @param receiver Address to send underlying tokens to.
/// @param owner  Address whose shares are burned.
/// @return assets Amount of MockUSDC returned.
function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);

/// @notice Returns total MockUSDC controlled by the vault (idle + deployed).
/// @dev Overrides ERC4626 default. MUST include strategy balance or share price is wrong.
/// @return Total assets in 6-decimal USDC units.
function totalAssets() public view returns (uint256);

// ── YieldPilot extensions ──

/// @notice Push `amount` of idle USDC from the vault into MockAave.
/// @dev Only callable by owner. Approves MockAave then calls supply().
///      Emits StrategyDeposit.
/// @param amount MockUSDC amount (6 decimals) to deploy.
function deployToStrategy(uint256 amount) external onlyOwner nonReentrant;

/// @notice Pull `amount` of USDC back from MockAave into the vault.
/// @dev Only callable by owner. Emits StrategyWithdraw.
/// @param amount MockUSDC amount (6 decimals) to recall.
function recallFromStrategy(uint256 amount) external onlyOwner nonReentrant;
```

#### Events emitted

| Event | Source | Trigger |
|---|---|---|
| `Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)` | ERC-4626 std | `deposit()` / `mint()` |
| `Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)` | ERC-4626 std | `withdraw()` / `redeem()` |
| `StrategyDeposit(uint256 amount)` | IYieldVault | `deployToStrategy()` |
| `StrategyWithdraw(uint256 amount)` | IYieldVault | `recallFromStrategy()` |

#### Revert conditions

| Condition | Error |
|---|---|
| `assets == 0` | OZ ERC4626: `ERC4626ExceededMaxDeposit` |
| Caller lacks share allowance on `withdraw`/`redeem` | OZ ERC20: `ERC20InsufficientAllowance` |
| `deployToStrategy` called by non-owner | OZ: `OwnableUnauthorizedAccount` |
| Reentrancy attempt | OZ: `ReentrancyGuardReentrantCall` |

#### Security considerations

- `totalAssets()` includes `strategy.getBalance(asset, address(this))` — if MockAave is replaced with a malicious contract this read is untrusted. In production, add a trusted-strategy registry and a cap.
- The vault approves MockAave for exactly `amount` before each `supply()` call (not `type(uint256).max`) to limit blast radius.
- `SafeERC20` is not needed for the vault's own operations on its own ERC-20 shares, but any future arbitrary-token path must use it.

---

### 2.2 MockAave

**Purpose.** Simulated Aave lending pool that accrues a configurable fixed APY on principal; used on testnet because Aave V3 is not reliably available on all testnets.

#### Inheritance chain

```
MockAave
  ├── @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol  (library)
  ├── @openzeppelin/contracts/access/Ownable.sol
  └── contracts/interfaces/IMockAave.sol
```

#### Storage layout

| Type | Name | Default | Notes |
|---|---|---|---|
| `uint256` | `apyBps` | `500` | 5% APY; owner-configurable |
| `uint256` | `BPS` | `10_000` | constant |
| `uint256` | `SECONDS_PER_YEAR` | `365 days` | constant |
| `mapping(address token => mapping(address user => Position))` | `_positions` | — | private |

`Position` struct: `{ uint256 principal; uint256 lastUpdate; }`.

#### External functions

```solidity
/// @notice Deposit `amount` of `token` into the pool on behalf of msg.sender.
/// @dev Accrues interest on any prior balance before adding new principal.
///      Uses SafeERC20.safeTransferFrom — caller must have approved MockAave.
///      Emits Supplied.
/// @param token  ERC-20 token address (MockUSDC in normal flow).
/// @param amount Amount to deposit (in token's native decimals).
function supply(address token, uint256 amount) external;

/// @notice Withdraw `amount` of `token` from the pool to msg.sender.
/// @dev Reverts if amount exceeds accrued balance. Uses SafeERC20.safeTransfer.
///      Emits Withdrawn.
/// @param token  ERC-20 token address.
/// @param amount Amount to withdraw.
/// @return withdrawn Actual amount transferred (always == amount on success).
function withdraw(address token, uint256 amount) external returns (uint256 withdrawn);

/// @notice Return the current balance (principal + accrued interest) for `user`.
/// @dev Pure view — uses block.timestamp; result will differ at execution time.
/// @param token ERC-20 token address.
/// @param user  Account to query.
/// @return balance Current balance in token decimals.
function getBalance(address token, address user) external view returns (uint256 balance);

/// @notice Update the simulated APY (in basis points). Owner only.
/// @dev Changing APY does not retroactively restate accrued interest — it only
///      affects future accrual from the next `supply`/`withdraw` that touches
///      a position.
/// @param newApy New APY in basis points (e.g. 800 = 8%).
function setApyBps(uint256 newApy) external onlyOwner;
```

#### Events emitted

| Event | Trigger |
|---|---|
| `Supplied(address indexed token, address indexed from, uint256 amount)` | `supply()` |
| `Withdrawn(address indexed token, address indexed to, uint256 amount)` | `withdraw()` |

#### Revert conditions

| Condition | Revert |
|---|---|
| `amount > available balance` | `require` string `"insufficient"` — replace with custom error `MockAave__InsufficientBalance(uint256 requested, uint256 available)` in Phase 1 |
| Non-owner calls `setApyBps` | OZ: `OwnableUnauthorizedAccount` |

#### Security considerations

- Interest accrual is simple linear (`principal × apyBps × elapsed / BPS / SECONDS_PER_YEAR`) — not compound. Sufficient for display purposes; do not represent this as production-accurate Aave yields.
- `withdraw` uses a checks-effects-interactions pattern: balance is written before `safeTransfer`. No reentrancy guard is currently present — add `nonReentrant` since `safeTransfer` triggers a callback on ERC-777 tokens. MockUSDC is a plain ERC-20, so low risk, but add the guard for correctness.

---

### 2.3 Paymaster

**Purpose.** ERC-4337 verifying paymaster that sponsors gas for `YieldVault.deposit` UserOperations up to a configurable per-vault lifetime cap.

#### Inheritance chain

```
Paymaster
  ├── @account-abstraction/contracts/core/BasePaymaster.sol  (Phase 5 upgrade)
  │     (skeleton: @openzeppelin/contracts/access/Ownable.sol + ReentrancyGuard.sol)
  └── (no local interface — interacts with IEntryPoint from @account-abstraction/contracts)
```

> **Phase 5 upgrade path:** The skeleton today uses plain `Ownable + ReentrancyGuard`. Phase 5 replaces the class body with `BasePaymaster` from `@account-abstraction/contracts v0.7`, which ships `validatePaymasterUserOp` / `postOp` hooks and manages the EntryPoint stake/deposit lifecycle. Import: `@account-abstraction/contracts/core/BasePaymaster.sol`.

#### Storage layout

| Type | Name | Notes |
|---|---|---|
| `mapping(address vault => bool)` | `allowedTargets` | Vaults eligible for sponsorship |
| `mapping(address vault => uint256)` | `gasBudget` | Lifetime cap in wei per vault |
| `mapping(address vault => uint256)` | `gasUsed` | Cumulative sponsored wei per vault |
| `address` | `verifier` | Phase 5: off-chain signer whose ECDSA signature authorises each UserOp |

#### External functions

```solidity
/// @notice Whitelist or revoke a vault for gas sponsorship.
/// @dev Only owner. Emits TargetWhitelisted.
/// @param vault   Target vault address.
/// @param allowed True to whitelist, false to revoke.
function setTarget(address vault, bool allowed) external onlyOwner;

/// @notice Set the lifetime sponsored gas cap (in wei) for a vault.
/// @dev Only owner. Emits BudgetSet.
/// @param vault Target vault address.
/// @param cap   Lifetime cap in wei (e.g. 0.05 ether = 50_000 gwei).
function setBudget(address vault, uint256 cap) external onlyOwner;

/// @notice Validate and record a sponsorship commitment (Phase 5: called from postOp).
/// @dev Enforces allowedTargets and gasBudget. Reverts on budget overflow.
///      Emits GasSponsored. nonReentrant because it modifies gasUsed.
/// @param vault    The vault the UserOp is depositing into.
/// @param user     The smart-account sender of the UserOp.
/// @param gasCost  Actual gas cost in wei (from EntryPoint postOp actualGasCost).
function recordSponsorship(address vault, address user, uint256 gasCost)
    external onlyOwner nonReentrant;

// ── Phase 5 (BasePaymaster overrides) ──

/// @notice EntryPoint calls this during UserOp validation.
/// @dev Decodes paymasterAndData: [validUntil(6)] [validAfter(6)] [sig(65)].
///      Verifies ECDSA signature from `verifier`. Returns context = (sender, vault, maxCost).
///      Validation must be stateless per ERC-7562; do not read gasUsed here.
/// @param userOp     The packed UserOperation.
/// @param userOpHash Hash of the UserOperation (provided by EntryPoint).
/// @param maxCost    Maximum gas cost the EntryPoint may charge (wei).
/// @return context        ABI-encoded (address sender, address vault, uint256 maxCost).
/// @return validationData Packed (sigFailed, validUntil, validAfter).
function _validatePaymasterUserOp(
    PackedUserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 maxCost
) internal override returns (bytes memory context, uint256 validationData);

/// @notice EntryPoint calls this after UserOp execution to settle actual cost.
/// @dev MUST NOT revert — a revert here slashes the paymaster stake.
///      Decodes context, calls recordSponsorship with actualGasCost.
/// @param mode          PostOpMode (opSucceeded, opReverted, postOpReverted).
/// @param context       Context returned from _validatePaymasterUserOp.
/// @param actualGasCost Actual wei charged by the EntryPoint.
/// @param actualUserOpFeePerGas Effective fee per gas unit.
function _postOp(
    PostOpMode mode,
    bytes calldata context,
    uint256 actualGasCost,
    uint256 actualUserOpFeePerGas
) internal override;

/// @notice Accept ETH to pre-fund the EntryPoint deposit.
receive() external payable;
```

#### Events emitted

| Event | Trigger |
|---|---|
| `TargetWhitelisted(address indexed vault, bool allowed)` | `setTarget()` |
| `BudgetSet(address indexed vault, uint256 cap)` | `setBudget()` |
| `GasSponsored(address indexed vault, address indexed user, uint256 gasCost)` | `recordSponsorship()` |

#### Custom errors

```solidity
error Paymaster__TargetNotAllowed(address vault);
error Paymaster__BudgetExceeded(address vault, uint256 requested, uint256 remaining);
```

#### Security considerations

- `_validatePaymasterUserOp` must not read `gasUsed` (mutable per-vault storage) — this violates ERC-7562 storage rules and causes bundlers to silently reject the UserOp. Enforce budget only in `_postOp` / `recordSponsorship`.
- `_postOp` must never revert; wrap `recordSponsorship` in a try/catch when called from `_postOp`.
- The verifier private key is the sponsorship oracle. Store in a KMS; expose `setVerifier(address)` (owner-only).
- Call `entryPoint.depositTo(address(this))` and `paymaster.addStake(delay)` post-deploy before the paymaster can participate in the mempool.

---


**Purpose.** Safe transaction guard that enforces an on-chain `(target, selector)` allow-list, preventing operators (and owners) from calling unauthorized functions on the Safe.

#### Inheritance chain

```
  ├── @openzeppelin/contracts/access/Ownable.sol
        implemented inline — no external import required for the interface itself
        (Safe v1.4.1 Guard interface is a 2-function interface; replicate locally)
```


#### Storage layout

| Type | Name | Notes |
|---|---|---|
| `mapping(address target => mapping(bytes4 selector => bool))` | `allowed` | The allow-list |

#### External functions

```solidity
/// @notice Add or remove a (target, selector) pair from the allow-list.
/// @dev Only owner. Emits SelectorAllowed.
/// @param target   Contract address the Safe may call.
/// @param selector 4-byte function selector (e.g. bytes4(keccak256("deposit(uint256,address)"))).
/// @param value    True to allow, false to revoke.
function setAllowed(address target, bytes4 selector, bool value) external onlyOwner;

/// @notice Safe calls this before every transaction. Reverts if the call is not allowed.
/// @dev Stateless — view function. Extracts selector from data[:4].
///      Empty calldata (pure ETH send) uses selector bytes4(0); ensure that
///      entry is set to false by default (it is — mapping default).
/// @param to        Target address of the Safe transaction.
/// @param value     ETH value (unused in this guard; kept for interface compliance).
/// @param data      Calldata of the Safe transaction.
/// @param operation 0 = Call, 1 = DelegateCall (unused; kept for interface compliance).
function checkTransaction(
    address to,
    uint256 value,
    bytes calldata data,
    uint8 operation,
    uint256 safeTxGas,
    uint256 baseGas,
    uint256 gasPrice,
    address gasToken,
    address payable refundReceiver,
    bytes memory signatures,
    address msgSender
) external view;

/// @param txHash   Hash of the executed transaction (unused).
/// @param success  Whether the transaction succeeded (unused).
function checkAfterExecution(bytes32 txHash, bool success) external;
```

#### Events emitted

| Event | Trigger |
|---|---|
| `SelectorAllowed(address indexed target, bytes4 indexed selector, bool allowed)` | `setAllowed()` |

#### Custom errors

```solidity
```

#### Security considerations

- `checkTransaction` is `view` — it cannot modify state, so it cannot track per-call budgets. Rate-limiting must live in the module or off-chain.
- The guard applies to **all** Safe transactions, including owner-initiated ones. Do not add an overly restrictive allow-list during testing or owners will lock themselves out.
- `delegatecall` (`operation == 1`) from an owner transaction is not blocked by this guard because the guard only checks `to` + `selector`, not `operation`. If you need to block delegatecalls, add `require(operation == 0)` inside `checkTransaction`.
- Install guard **before** enabling the module to avoid the window where the module is active without the guard. Or batch both with Safe's `MultiSend`.

---



#### Inheritance chain

```
  ├── @openzeppelin/contracts/access/Ownable.sol
  └── ISafe (declared inline: execTransactionFromModule)
```

#### Storage layout

| Type | Name | Notes |
|---|---|---|
| `mapping(address safe => mapping(address operator => bool))` | `operators` | Per-Safe operator registry |

#### External functions

```solidity
/// @notice Authorize an operator to act on behalf of `safe`.
/// @dev MUST be called via a Safe transaction (msg.sender == safe).
///      Emits OperatorAdded.
/// @param operator Address being granted operator rights.
function addOperator(address safe, address operator) external;

/// @notice Revoke an operator's access to `safe`.
/// @dev MUST be called via a Safe transaction (msg.sender == safe).
///      Emits OperatorRemoved.
/// @param operator Address being revoked.
function removeOperator(address safe, address operator) external;

/// @notice Operator entry-point: execute `data` on `target` through `safe`.
/// @dev Phase 4: replaces event-only body with ISafe.execTransactionFromModule call.
///      Emits StrategyExecuted.
/// @param data   ABI-encoded calldata (selector + args).
function executeStrategy(address safe, address target, bytes calldata data) external;
```

Phase 4 body for `executeStrategy`:

```solidity
bool ok = ISafe(safe).execTransactionFromModule(target, 0, data, 0 /* Call */);
emit StrategyExecuted(safe, msg.sender, target);
```

#### Events emitted

| Event | Trigger |
|---|---|
| `OperatorAdded(address indexed safe, address indexed operator)` | `addOperator()` |
| `OperatorRemoved(address indexed safe, address indexed operator)` | `removeOperator()` |
| `StrategyExecuted(address indexed safe, address indexed operator, address indexed target)` | `executeStrategy()` |

#### Custom errors

```solidity
```

#### Security considerations

- `addOperator` / `removeOperator` check `msg.sender == safe`. This is the correct pattern — only a Safe transaction (which clears M-of-N) can mutate the operator registry.
- The module holds no funds. Its only power is calling `execTransactionFromModule`. Audit the module's logic to ensure it cannot escalate beyond its stated purpose.
- `execTransactionFromModule` with `operation = 0` (Call) is mandatory. Never pass `operation = 1` (DelegateCall) — this would run module logic inside the Safe's storage context.

---

### 2.6 MockUSDC

**Purpose.** Minimal 6-decimal ERC-20 test token with a public faucet so testers never need a real faucet service.

#### Inheritance chain

```
MockUSDC
  ├── @openzeppelin/contracts/token/ERC20/ERC20.sol
  └── @openzeppelin/contracts/access/Ownable.sol
```

#### Storage layout

| Type | Name | Notes |
|---|---|---|
| `uint8` | `_DECIMALS` | constant `6` |
| `uint256` | `FAUCET_AMOUNT` | constant `1_000 * 10**6` |

#### External functions

```solidity
/// @notice Issue 1,000 mUSDC to msg.sender. Unrestricted — testnet only.
/// @dev Calls _mint; no cap enforced. Remove or cap in any production fork.
function faucet() external;

/// @notice Mint `amount` of mUSDC to `to`. Owner only.
/// @dev Used in Hardhat tests for deterministic seeding.
/// @param to     Recipient address.
/// @param amount Amount in mUSDC units (6 decimals).
function mint(address to, uint256 amount) external onlyOwner;

/// @notice Override decimals to return 6 (USDC standard).
function decimals() public pure override returns (uint8);
```

---

## 3. Key Invariants

These must hold at all times. The test suite must assert them after every state-changing operation.

1. **Share price is monotonically non-decreasing.**  
   `vault.convertToAssets(1e6) >= prior_convertToAssets(1e6)` after any `deployToStrategy` or time passing (accrued yield in MockAave).

2. **totalAssets accuracy.**  
   `vault.totalAssets() == MockUSDC.balanceOf(vault) + MockAave.getBalance(MockUSDC, vault)` at all times.

3. **No stranded shares.**  
   `vault.totalSupply() == 0 ↔ vault.totalAssets() == 0` (ignoring the inflation-seed deposit described in §4).

4. **Gas budget never overdrawn.**  
   `paymaster.gasUsed[vault] <= paymaster.gasBudget[vault]` for all vaults; `recordSponsorship` reverts before this is violated.

5. **Operator set immutability without Safe quorum.**  
   `operators[safe][x]` can only change when `msg.sender == safe`, which requires a Safe transaction clearing M-of-N. No external EOA can mutate it directly.


---

## 4. ERC-4626 Inflation Attack Mitigation

**The attack.** A first depositor mints 1 share by depositing 1 wei, then donates `N` tokens directly to the vault address (bypassing `deposit`). `totalAssets` rises to `N + 1` while `totalSupply` stays at 1. A second depositor's assets round down to 0 shares, losing their funds to the attacker.

**OZ v5 mitigation.** OpenZeppelin's `ERC4626.sol` (v5) applies a **virtual offset** of `10 ** _decimalsOffset()` shares and assets, where `_decimalsOffset()` defaults to `0` but can be overridden. The virtual supply means `convertToAssets` and `convertToShares` always compute against `totalSupply() + 10**offset` and `totalAssets() + 10**offset`, neutralising the donation attack for offsets ≥ 1.

**YieldVault configuration.** Override `_decimalsOffset()` to return `6` (matching MockUSDC's 6 decimals). This gives a virtual share offset of `1_000_000`, making a donation attack economically infeasible without the attacker committing ≥ 10^6 tokens. Add to `YieldVault`:

```solidity
// @openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol
function _decimalsOffset() internal pure override returns (uint8) {
    return 6;
}
```

This is the approach documented in [OZ ERC-4626 security considerations](https://docs.openzeppelin.com/contracts/5.x/erc4626#inflation-attack). No custom seed deposit is needed alongside this override.

---

## 5. ERC-4337 Integration

### EntryPoint addresses

| Network | Chain ID | EntryPoint v0.7 |
|---|---|---|
| Sepolia (primary) | 11155111 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| Base Sepolia (secondary) | 84532 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |

Same address on both — the singleton is chain-agnostic.

### Implementation choice

Use `@account-abstraction/contracts v0.7` (`BasePaymaster`). Do **not** roll a custom EntryPoint interface — the reference implementation ships hardened validation logic and the correct `PackedUserOperation` struct for v0.7.

```
npm install @account-abstraction/contracts
```

### `validatePaymasterUserOp` ↔ `postOp` contract

1. **`validatePaymasterUserOp`** is called by the EntryPoint during simulation and submission. It must:
   - Decode `paymasterAndData[20:]` as `[validUntil(6 bytes)][validAfter(6 bytes)][sig(65 bytes)]`.
   - Recover the ECDSA signer from the structured hash and compare to `verifier`.
   - Return `context = abi.encode(userOp.sender, vaultAddress, maxCost)` and `validationData = _packValidationData(sigFailed, validUntil, validAfter)`.
   - Must **not** read `gasUsed` or any per-user mutable storage (ERC-7562 storage rules).

2. **`postOp`** is called after UserOp execution with `actualGasCost`:
   - Decode context → `(sender, vault, maxCost)`.
   - Call `recordSponsorship(vault, sender, actualGasCost)` inside a `try/catch` — `postOp` reverts are fatal (paymaster is slashed).
   - Emit `GasSponsored(vault, sender, actualGasCost)`.

### Bundler


---


### Setup sequence (one-time, operator onboarding)

```
1. User creates a Safe (1-of-1 for MVP, 2-of-3 for team).
   (Install guard before module goes live — see pitfall in §2.4.)
   (This tx originates from the Safe, so msg.sender == safe — the check passes.)
```

### Per-strategy execution sequence

```
Operator EOA
      → checks operators[safe][msg.sender]  ← revert if not operator
      → calls ISafe(safe).execTransactionFromModule(target, 0, data, 0)
              → extracts selector = bytes4(data[:4])
              → checks allowed[target][selector]  ← revert if not in allow-list
          → if guard passes: Safe executes target.call(data)
          → Safe emits ExecutionFromModuleSuccess(txHash, value)
```

### Allow-list configuration table

| Target | Function | Selector | Allowed |
|---|---|---|---|
| `YieldVault` | `deposit(uint256,address)` | `bytes4(0x6e553f65)` | YES |
| `YieldVault` | `withdraw(uint256,address,address)` | `bytes4(0xb460af94)` | YES |
| `MockAave` | `supply(address,uint256)` | `bytes4(0x7c674e73)` | YES |
| `MockAave` | `withdraw(address,uint256)` | `bytes4(0x69328dec)` | YES |
| `MockUSDC` | `approve(address,uint256)` | `bytes4(0x095ea7b3)` | YES (needed for supply) |
| `MockUSDC` | `transfer(address,uint256)` | `bytes4(0xa9059cbb)` | **NO** |

> Selectors computed as `bytes4(keccak256(signature))`. Verify with `cast sig "<signature>"` (Foundry) or Hardhat's `ethers.id(sig).slice(0,10)`.

---

## 7. Chainlink Price Feed Integration

### USDC/USD feed addresses

| Network | Feed | Address | Heartbeat |
|---|---|---|---|
| Sepolia | ETH/USD (proxy for display) | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | 1 hour |
| Base Sepolia | ETH/USD | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` | 1 hour |

> A native USDC/USD feed does not exist on Sepolia as of April 2026. Use the ETH/USD feed to compute a rough USD value of vault holdings (share price × ETH/USD). Alternatively, since MockUSDC is a 1:1 peg mock, treat 1 mUSDC = $1.00 in the frontend and display that assumption explicitly to users. No on-chain feed call is required by the vault contracts themselves for MVP.

### On-chain staleness check (if reading the ETH/USD feed)

```solidity
uint256 public constant STALE_AFTER = 3600; // 1 hour — matches Sepolia heartbeat

function _getEthUsd() internal view returns (int256) {
    (, int256 answer,, uint256 updatedAt,) = priceFeed.latestRoundData();
    if (answer <= 0) revert Oracle__InvalidPrice();
    if (block.timestamp - updatedAt > STALE_AFTER) revert Oracle__StalePrice(updatedAt);
    return answer; // 8 decimals
}
```

### Frontend usage

The frontend reads the feed directly via wagmi `useReadContract` on the `latestRoundData` ABI. Feed address is stored in `` (or a chain-specific constants file), not hardcoded in component code.

---

## 8. Events (Subgraph ABI)

The subgraph in `apps/subgraph/` indexes the following events. Signatures below are ABI-canonical — parameter names and `indexed` placement must match exactly or the mapping handlers will silently receive empty data.

| Contract | Event | Subgraph Entity |
|---|---|---|
| `YieldVault` | `Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)` | `VaultDeposit` |
| `YieldVault` | `Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)` | `VaultWithdrawal` |
| `YieldVault` | `StrategyDeposit(uint256 amount)` | (internal, not currently indexed) |
| `YieldVault` | `StrategyWithdraw(uint256 amount)` | (internal, not currently indexed) |
| `Paymaster` | `GasSponsored(address indexed vault, address indexed user, uint256 gasCost)` | (optional — Phase 5) |
| `MockAave` | `Supplied(address indexed token, address indexed from, uint256 amount)` | (not indexed — mock only) |
| `MockAave` | `Withdrawn(address indexed token, address indexed to, uint256 amount)` | (not indexed — mock only) |

**Subgraph `schema.graphql` mapping notes:**

- `VaultDeposit.user` maps to `event.params.owner` (the share recipient), not `sender` (the depositor). Confirm in the subgraph mapping handler.
- `UserPosition` is a derived entity updated on every `VaultDeposit` and `VaultWithdrawal`; it is not backed by a single event.

---

## 9. Deploy Order

Confirmed and adjusted from `packages/contracts/ignition/modules/YieldPilotModule.ts`:

```
1. MockUSDC          — no dependencies
2. MockAave          — no dependencies (parallel with MockUSDC)
3. YieldVault        — depends on MockUSDC + MockAave addresses
4. Paymaster         — no contract dependency; needs deployer EOA as initial owner
```


**Ignition module correction needed:** Pass the `EntryPoint` address to `Paymaster` once `BasePaymaster` is adopted in Phase 5. Add:

```ts
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const paymaster = m.contract("Paymaster", [ENTRY_POINT, deployer], { after: [] });
```

---

## 10. Post-Deploy Wiring

Execute these calls immediately after deployment, in order. All calls use the deployer EOA (account 0 in Ignition).

```
# 1. Whitelist YieldVault in Paymaster + set budget
Paymaster.setTarget(YieldVault.address, true)
Paymaster.setBudget(YieldVault.address, 0.05 ether)   // 50_000 gwei lifetime cap (testnet)


# 3. Fund Paymaster on EntryPoint (Phase 5)
EntryPoint.depositTo{ value: 0.1 ether }(Paymaster.address)
Paymaster.addStake{ value: 0.01 ether }(86400)   // 1 day unstake delay

# 4. Transfer ownership of admin contracts to a multisig (production) or keep deployer (testnet)
YieldVault.transferOwnership(adminMultisig)
Paymaster.transferOwnership(adminMultisig)

# 5. Mint test tokens to deployer for integration testing
MockUSDC.mint(deployer, 1_000_000 * 1e6)
```

---

## 11. Testing Plan

All tests live in `packages/contracts/test/`. Framework: Hardhat + ethers v6 + Chai. Target >90% line coverage.

| # | Test | Contract(s) | What it asserts |
|---|---|---|---|
| 1 | Deposit round trip | YieldVault, MockUSDC | `deposit(1000e6)` → shares minted to receiver; `redeem(shares)` → 1000e6 returned; no dust |
| 2 | Inflation attack mitigation | YieldVault | First depositor mints 1 share; attacker donates 1e12 tokens directly; second depositor's `convertToAssets(shares)` returns correct amount (not 0) thanks to `_decimalsOffset = 6` |
| 3 | totalAssets accuracy | YieldVault, MockAave | After `deployToStrategy(500e6)`: `vault.totalAssets() == MockUSDC.balanceOf(vault) + MockAave.getBalance(MockUSDC, vault)` |
| 4 | Strategy round-trip with accrued yield | YieldVault, MockAave | Deploy 1000 USDC; advance time by 365 days; `recallFromStrategy`; `vault.totalAssets() > 1000e6`; share price increased |
| 5 | Paymaster budget enforcement | Paymaster | `setBudget(vault, 1000)` then `recordSponsorship(vault, user, 1001)` reverts with `Paymaster__BudgetExceeded` |
| 6 | Paymaster whitelist | Paymaster | `recordSponsorship` on non-whitelisted vault reverts with `Paymaster__TargetNotAllowed` |
| 11 | ERC-4626 standard compliance | YieldVault | `maxDeposit`, `maxWithdraw`, `convertToShares`, `convertToAssets` return values consistent with OZ spec; round-trip `deposit → withdraw` returns ≥ input (due to accrued yield) |
| 12 | MockUSDC faucet | MockUSDC | Any address can call `faucet()` and receive exactly `1000e6` mUSDC; `mint` is owner-only |

---

## 12. Known Pitfalls

Sourced directly from the primitive knowledge files; most critical for this architecture:

1. **`totalAssets()` must include strategy balance** (`erc4626.md`). If `deployToStrategy` is called but `totalAssets()` does not query `MockAave.getBalance`, share prices are computed against a smaller asset base and early withdrawers receive more than their fair share. The current skeleton already handles this — confirm it is never regressed by a refactor.

2. **`_postOp` reverts slash the paymaster** (`paymaster.md`). Any revert inside `_postOp` causes the EntryPoint to treat the UserOp as if the paymaster failed and charges the paymaster's deposit as a penalty. Wrap all state-changing logic in `_postOp` in a `try/catch` and emit a failure event rather than reverting.

3. **ERC-7562 storage rules in `validatePaymasterUserOp`** (`paymaster.md`, `erc4337.md`). Reading per-vault `gasUsed` inside validation makes the UserOp unbundleable (bundlers drop it silently). Keep validation stateless: verify only the off-chain ECDSA signature and time window.

4. **Guard applies to owner transactions too** (`safe-custom-modules.md`). If a Safe owner tries to call `YieldVault.deployToStrategy()` directly via the Safe (not through the module), the guard will block it unless that selector is in the allow-list. Either add it to the allow-list or ensure owners use the module for all strategy operations.

5. **No atomic module + guard installation** (`safe-custom-modules.md`). `enableModule` and `setGuard` are separate Safe transactions. There is a brief window after `enableModule` where the module can call `execTransactionFromModule` without the guard. Always set the guard first (step 2 before step 3 in the onboarding sequence in §6).
