"use client";

import dynamic from "next/dynamic";

export const LazyMap = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});
