import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <p className="text-2xl font-extrabold tracking-tight text-navy">
          Stays<span className="text-orange">Direct</span>
        </p>
        <p className="mb-5 text-sm text-slate-500">Growth Engine</p>
        {error === "link" ? (
          <p className="mb-4 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
            That link has expired or was already used. Request a new one below.
          </p>
        ) : null}
        <LoginForm />
      </div>
    </main>
  );
}
