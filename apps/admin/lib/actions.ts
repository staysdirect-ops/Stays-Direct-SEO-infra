export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export function ok(message?: string): ActionResult {
  return { ok: true, message };
}

export function fail(error: unknown): ActionResult {
  return {
    ok: false,
    error:
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Something went wrong",
  };
}
