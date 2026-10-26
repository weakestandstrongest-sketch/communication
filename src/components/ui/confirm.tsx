"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Sheet } from "./sheet";
import { Button } from "./button";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
};

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    resolver.current?.(false);
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet open={Boolean(opts)} onClose={() => close(false)} size="sm" hideHeader>
        {opts && (
          <div className="px-5 pt-6 pb-4 text-center">
            <h2 className="text-[17px] font-semibold">{opts.title}</h2>
            {opts.message && <p className="mt-2 text-[14px] leading-relaxed text-label-2">{opts.message}</p>}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
              <Button variant={opts.destructive ? "danger" : "primary"} block onClick={() => close(true)} data-autofocus>
                {opts.confirmLabel ?? "OK"}
              </Button>
              <Button variant="secondary" block onClick={() => close(false)}>
                キャンセル
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
