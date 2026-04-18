import { ClientOnly } from "../../components/shared/ClientOnly";
import { PendingTxList } from "../../components/multisig/PendingTxList";

export default function MultisigPage() {
  return (
    <ClientOnly>
      <section className="space-y-6">
        <header className="max-w-2xl">
          <h1 className="text-3xl font-semibold font-display">Multi-sig</h1>
          <p className="mt-1 text-muted-foreground">
            Pending Safe transactions needing signatures. Team-managed vaults (2-of-3+) flow
            through here before executing on-chain.
          </p>
        </header>
        <PendingTxList />
      </section>
    </ClientOnly>
  );
}
