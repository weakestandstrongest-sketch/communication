"use client";

export function RetryButton() {
  return (
    <button type="button" onClick={() => window.location.reload()} className="mt-6 h-11 rounded-xl bg-accent px-6 text-[15px] font-semibold text-accent-contrast">
      再読み込み
    </button>
  );
}
