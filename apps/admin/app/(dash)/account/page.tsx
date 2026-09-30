import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const me = await requireRole(["sales", "editor"]);
  const { welcome } = await searchParams;
  return (
    <>
      <PageHeader
        title="Account"
        description={
          <>
            Signed in as <b>{me.email}</b> ({me.role}).
          </>
        }
      />
      {welcome ? (
        <p className="mb-4 max-w-md rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
          Welcome. Set a password below so you can sign in without an email link next time.
        </p>
      ) : null}
      <PasswordForm />
    </>
  );
}
