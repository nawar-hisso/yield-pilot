"use client";

export function VaultPanel() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Vault</h1>
      <p className="text-muted-foreground">
        Deposit and withdraw forms land here in Phase 3. Includes a &ldquo;gasless deposit&rdquo;
        toggle (ERC-4337 paymaster) wired up in Phase 5.
      </p>
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        Scaffold placeholder — integration-planner output in docs/INTEGRATIONS.md describes the
        exact wagmi `useWriteContract` calls.
      </div>
    </section>
  );
}
