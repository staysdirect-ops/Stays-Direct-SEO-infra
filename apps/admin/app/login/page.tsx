import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <p className="text-2xl font-extrabold tracking-tight text-navy">
          Stays<span className="text-orange">Direct</span>
        </p>
        <p className="mb-5 text-sm text-slate-500">Growth Engine</p>
        <LoginForm />
      </div>
    </main>
  );
}
