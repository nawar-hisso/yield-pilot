"use client";

import { SafeStatusCard } from "./SafeStatusCard";
import { OperatorList } from "./OperatorList";
import { ClientOnly } from "../shared/ClientOnly";

export function DelegatePanel() {
  return (
    <ClientOnly>
      <section className="space-y-6">
        <header className="max-w-2xl">
          <h1 className="text-3xl font-semibold font-display">Delegate</h1>
          <p className="mt-1 text-muted-foreground">
            Authorize an automated strategy or teammate to move funds through your Safe — without
            handing over key material. Every call passes through the Guard's allow-list.
          </p>
        </header>

        <SafeStatusCard />

        <div className="grid gap-4 lg:grid-cols-2">
          <OperatorList />
        </div>
      </section>
    </ClientOnly>
  );
}
