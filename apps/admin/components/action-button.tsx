"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions";
import { Button, type ButtonProps } from "./ui/button";

export function ActionButton({
  action,
  children,
  confirm,
  onDone,
  ...props
}: Omit<ButtonProps, "onClick"> & {
  action: () => Promise<ActionResult>;
  confirm?: string;
  onDone?: (r: ActionResult) => void;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        {...props}
        disabled={pending || props.disabled}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            setResult(r);
            onDone?.(r);
          });
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {children}
      </Button>
      {result ? (
        <span
          role="status"
          className={result.ok ? "text-xs text-emerald-700" : "text-xs text-red-700"}
        >
          {result.ok ? (result.message ?? "Done") : result.error}
        </span>
      ) : null}
    </span>
  );
}
