import { expect, type Page } from "@playwright/test";
import { MAILPIT_URL, PASSWORD, USERS, type TestRole } from "./env";

export async function signIn(page: Page, who: TestRole | string, password = PASSWORD) {
  const email = who in USERS ? USERS[who as TestRole] : who;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Pages must render their heading and no error boundary. */
export async function expectHealthy(page: Page, heading: string | RegExp) {
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expect(
    page.getByText(/Application error|Something went wrong|Internal Server Error|non-2xx status/)
  ).toHaveCount(0);
}

/** Latest email to `to` from the local Supabase mail catcher (Mailpit). */
export async function latestEmailHtml(to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    const body = (await res.json()) as { messages?: Array<{ ID: string }> };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json()) as {
        HTML: string;
      };
      return msg.HTML;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No email to ${to}`);
}
