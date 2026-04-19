import { ClientOnly } from "../../components/shared/ClientOnly";
import { NetworkCard } from "../../components/settings/NetworkCard";
import { AccountCard } from "../../components/settings/AccountCard";
import { PairedDevicesCard } from "../../components/settings/PairedDevicesCard";

export default function SettingsPage() {
  return (
    <ClientOnly>
      <section className="space-y-6">
        <header className="max-w-2xl">
          <h1 className="text-3xl font-semibold font-display">Settings</h1>
          <p className="mt-1 text-muted-foreground">
            Network and account sections reflect the wallet + chain you&apos;re currently on.
            Paired devices are the passkeys authorised to sign for your smart account.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <AccountCard />
          <NetworkCard />
        </div>
        <PairedDevicesCard />
      </section>
    </ClientOnly>
  );
}
