import { DEFAULT_COMPANY_FACTS } from "@staysdirect/core/facts";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireRole([]);
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("*").single();
  const facts =
    data?.company_facts && Object.keys(data.company_facts).length
      ? data.company_facts
      : DEFAULT_COMPANY_FACTS;
  return (
    <>
      <PageHeader title="Settings" description="Admin only. Changes apply to the next job run." />
      {data ? (
        <SettingsForm initial={{ ...data, company_facts: JSON.stringify(facts, null, 2) }} />
      ) : (
        <p>Settings row missing.</p>
      )}
    </>
  );
}
