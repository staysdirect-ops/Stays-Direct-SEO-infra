"use client";

import { useEffect, useRef } from "react";

/** Sandboxed iframe with the exact HTML the public renderer serves. */
export function HtmlPreview({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const resize = () => {
      const h = frame.contentDocument?.documentElement.scrollHeight;
      if (h) frame.style.height = `${h + 20}px`;
    };
    frame.addEventListener("load", resize);
    return () => frame.removeEventListener("load", resize);
  }, []);
  return (
    <iframe
      ref={ref}
      title="Page preview"
      sandbox="allow-same-origin"
      srcDoc={html}
      className={className ?? "min-h-[600px] w-full rounded-lg border border-slate-200 bg-white"}
    />
  );
}
