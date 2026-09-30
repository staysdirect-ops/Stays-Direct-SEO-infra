import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shell/sidebar";
import { canAccess, getStaff } from "@/lib/auth";
import { NAV } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const staff = await getStaff();
  if (!staff) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-bold text-navy">No access yet</h1>
        <p className="mt-2 text-sm text-slate-600">
          You are signed in as {user.email}, but this account has no role. Ask an admin to run{" "}
          <code className="rounded bg-slate-100 px-1">
            pnpm promote-user {user.email} admin|sales|editor
          </code>
          .
        </p>
        <form action="/auth/signout" method="post" className="mt-4">
          <button className="text-sm font-medium text-navy-700 underline">Sign out</button>
        </form>
      </main>
    );
  }
  const items = NAV.filter((n) => canAccess(staff.role, n.roles));
  return (
    <div className="lg:flex">
      <Sidebar items={items} email={staff.email} role={staff.role} />
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
