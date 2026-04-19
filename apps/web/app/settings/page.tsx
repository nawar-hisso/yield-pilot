import { ClientOnly } from "../../components/shared/ClientOnly";
import { NotificationsCard } from "../../components/settings/NotificationsCard";
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
            Notifications live in apps/api (Prisma + Postgres). Network and account sections reflect
            the wallet + chain you&apos;re currently on.
          </p>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <NotificationsCard />
          <AccountCard />
        </div>
        <PairedDevicesCard />
        <NetworkCard />
      </section>
    </ClientOnly>
  );
}
