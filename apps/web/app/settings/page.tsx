export default function SettingsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-muted-foreground">
        Notification preferences and chain switching land here in Phase 6. They persist via
        apps/api → @yield-pilot/database (Postgres + Prisma).
      </p>
    </section>
  );
}
