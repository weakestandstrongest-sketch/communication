import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginCard } from "./login-card";

export const metadata: Metadata = { title: "ログイン" };

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 pt-safe pb-safe">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent)" }}
      />
      <Suspense>
        <LoginCard />
      </Suspense>
    </main>
  );
}
