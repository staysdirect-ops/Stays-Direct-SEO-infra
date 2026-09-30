"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Right-hand drawer (full width on phones). */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-navy/40" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-[1001] flex w-full flex-col bg-white shadow-xl focus:outline-none",
            wide ? "sm:max-w-3xl" : "sm:max-w-xl"
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-navy">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-xs text-slate-500">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">Details</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-navy/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[1001] max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-5 shadow-xl focus:outline-none">
          <div className="mb-3 flex items-start justify-between gap-3">
            <Dialog.Title className="text-base font-semibold text-navy">{title}</Dialog.Title>
            <Dialog.Close
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Details</Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
