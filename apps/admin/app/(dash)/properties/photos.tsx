"use client";

import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Label } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { setPropertyPhotos } from "./actions";
import { PHOTO_BUCKET, type Photo } from "./photo-types";

const MAX_EDGE = 1600;
const MAX_PHOTOS = 20;

/** Downscales large camera photos in the browser before upload (JPEG, longest edge 1600px). */
async function prepare(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't an image`);
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000 && file.type !== "image/png") return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't process image"))),
      "image/jpeg",
      0.85
    )
  );
}

export function PropertyPhotos({ id, initial }: { id: string; initial: Photo[] }) {
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function persist(next: Photo[]) {
    const r = await setPropertyPhotos(id, next);
    if (!r.ok) throw new Error(r.error);
    setPhotos(next);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const upload = (files: FileList) =>
    run(async () => {
      const list = [...files].slice(0, MAX_PHOTOS - photos.length);
      if (!list.length) throw new Error(`At most ${MAX_PHOTOS} photos per property.`);
      const storage = createClient().storage.from(PHOTO_BUCKET);
      const added: Photo[] = [];
      for (const file of list) {
        const blob = await prepare(file);
        const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
        const path = `${id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await storage.upload(path, blob, {
          contentType: blob.type || "image/jpeg",
          cacheControl: "31536000",
        });
        if (error) throw new Error(`${file.name}: ${error.message}`);
        added.push({ path, url: storage.getPublicUrl(path).data.publicUrl });
      }
      await persist([...photos, ...added]);
    });

  const remove = (p: Photo) =>
    run(async () => {
      if (!window.confirm("Delete this photo?")) return;
      await persist(photos.filter((x) => x.path !== p.path));
      await createClient().storage.from(PHOTO_BUCKET).remove([p.path]);
    });

  const move = (i: number, by: -1 | 1) =>
    run(async () => {
      const next = [...photos];
      const [p] = next.splice(i, 1);
      next.splice(i + by, 0, p!);
      await persist(next);
    });

  return (
    <div>
      <Label>Photos</Label>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((p, i) => (
          <figure
            key={p.path}
            className="group relative aspect-[4/3] overflow-hidden rounded-md bg-slate-100"
          >
            <img
              src={p.url}
              alt={`Photo ${i + 1}`}
              loading="lazy"
              className="size-full object-cover"
            />
            {i === 0 ? (
              <span className="absolute top-1 left-1 rounded bg-navy/80 px-1.5 text-[10px] font-semibold text-white">
                Cover
              </span>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-navy/70 p-0.5 text-white">
              <button
                type="button"
                aria-label="Move earlier"
                disabled={busy || i === 0}
                onClick={() => move(i, -1)}
                className="rounded p-1 hover:bg-white/20 disabled:opacity-30"
              >
                <ArrowLeft className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Delete photo"
                disabled={busy}
                onClick={() => remove(p)}
                className="rounded p-1 hover:bg-white/20"
              >
                <Trash2 className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move later"
                disabled={busy || i === photos.length - 1}
                onClick={() => move(i, 1)}
                className="rounded p-1 hover:bg-white/20 disabled:opacity-30"
              >
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </figure>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-navy-700 hover:text-navy"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            {busy ? "Working…" : "Add photos"}
          </button>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files);
          e.target.value = "";
        }}
      />
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
      <p className="mt-1 text-xs text-slate-500">
        The first photo is the cover. Photos are resized to 1600px and saved straight away; the
        links are public so they can go into outreach emails.
      </p>
    </div>
  );
}
