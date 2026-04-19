import { FaucetPanel } from "../../components/faucet/FaucetPanel";
import { AdminPanel } from "../../components/faucet/AdminPanel";

export default function FaucetPage() {
  return (
    <div className="space-y-10">
      <FaucetPanel />
      <AdminPanel />
    </div>
  );
}
