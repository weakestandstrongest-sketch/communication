import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginCard } from "./login-card";

export const metadata: Metadata = { title: "ログイン" };

const RING = "pointer-events-none absolute rounded-full border-[1.5px]";

export default function LoginPage() {
  // The login screen is always dark, whatever the device theme: it is the first thing people see.
  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-x-hidden overflow-y-auto bg-[#0b0b0c] px-6 pt-safe pb-safe text-white">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-44 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full opacity-[0.16]" style={{ background: "radial-gradient(closest-side, #f0c9b4, transparent)" }} />
        <div className={`${RING} -top-24 -left-32 size-[360px] border-[#f5f3ee]/20`} style={{ animation: "login-orbit-a 14s ease-in-out infinite" }} />
        <div className={`${RING} top-[22%] -right-40 size-[420px] border-[#f0c9b4]/25`} style={{ animation: "login-orbit-b 17s ease-in-out infinite" }} />
        <div className={`${RING} -bottom-32 left-[8%] size-[340px] border-[#f2e04a]/20`} style={{ animation: "login-orbit-c 16s ease-in-out infinite" }} />
      </div>
      <Suspense>
        <LoginCard />
      </Suspense>
    </main>
  );
}
