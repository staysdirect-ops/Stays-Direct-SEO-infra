import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PropertiesView, type Property } from "./properties-view";

export const metadata = { title: "Properties" };

export default async function PropertiesPage() {
  await requireRole(["sales"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select(
      "id,name,address,town,postcode,bedrooms,max_guests,parking_spaces,van_parking,pppn_from,available_from,status,notes,geocode_status,lat,lng,photos,updated_at"
    )
    .order("town")
    .order("name");
  return (
    <>
      <PageHeader
        title="Properties"
        description="Our houses. Radar matches projects against these, and location pages quote from them, so keep status and prices current."
      />
      {error ? <p className="mb-3 text-sm text-red-700">{error.message}</p> : null}
      <PropertiesView properties={(data ?? []) as Property[]} />
    </>
  );
}
