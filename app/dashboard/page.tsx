import { AppNav } from "../components/app-nav";
import { DashboardShell } from "../components/dashboard-shell";
import { getDashboardData } from "../lib/dashboard";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <main className="page app-page dashboard-page">
      <AppNav />
      <DashboardShell data={data} />
    </main>
  );
}
