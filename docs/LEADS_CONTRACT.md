# Leads contract

The Lovable leads app reads leads from this project's Supabase database. This document is the stable contract: column names in `public.leads_export` and the webhook payload will not be renamed or removed without a new version of this document. New columns may be added.

## Where leads come from

| `source`     | Created by                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `radar`      | Project Radar, from newly awarded public contracts. The company is the contractor that won the work. Includes drafted outreach. |
| `seo_form`   | The website quote form (`public-lead` endpoint)                                                                                 |
| `calculator` | The website cost calculator (`public-lead` with `source: "calculator"`)                                                         |
| `manual`     | Created by hand (admin app or the leads app)                                                                                    |

## Reading leads

Read from the view **`public.leads_export`**. It has `security_invoker` on, so the caller's row-level security applies:

- **From a backend** (recommended): use the project URL and the **service-role key**, kept server-side only. It can read everything.
- **From a signed-in user**: a Supabase Auth user whose `admin_users.role` is `sales` or `admin` can read and update leads. Other users see nothing.

```ts
const { data } = await supabase
  .from("leads_export")
  .select("*")
  .gte("updated_at", since)
  .order("updated_at", { ascending: true });
```

Poll with `updated_at` (set on every change) to sync incrementally.

### Columns

| Column                   | Type        | Notes                                                                                                                 |
| ------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`                     | uuid        | Primary key                                                                                                           |
| `created_at`             | timestamptz |                                                                                                                       |
| `updated_at`             | timestamptz | Changes on every update                                                                                               |
| `source`                 | text        | `radar` · `seo_form` · `calculator` · `manual`                                                                        |
| `company_name`           | text        | Radar: the awarded supplier                                                                                           |
| `companies_house_number` | text        | 8 characters when known (e.g. `01234567`, `SC123456`)                                                                 |
| `contact_name`           | text        | Filled by sales or the form                                                                                           |
| `contact_role`           | text        |                                                                                                                       |
| `contact_email`          | text        | Lower-cased for form leads                                                                                            |
| `contact_phone`          | text        |                                                                                                                       |
| `company_website`        | text        |                                                                                                                       |
| `project_id`             | uuid        | Radar project (null for form leads)                                                                                   |
| `project_title`          | text        | Contract title                                                                                                        |
| `site_town`              | text        | Where the work is (or the town the enquirer gave)                                                                     |
| `site_postcode`          | text        | Normalised UK postcode, e.g. `TA5 2LD`                                                                                |
| `est_workers`            | integer     | Radar: estimated workers away from home. Form: crew size given                                                        |
| `start_date`             | date        |                                                                                                                       |
| `value_gbp`              | numeric     | Contract value when published                                                                                         |
| `matched_property_ids`   | uuid[]      | Our houses within the match radius                                                                                    |
| `nearest_property_miles` | numeric     | Distance to our nearest matched house                                                                                 |
| `outreach_subject`       | text        | Draft email subject                                                                                                   |
| `outreach_body`          | text        | Draft email (≤120 words; contains `{first_name}` to replace; ends with the opt-out line)                              |
| `linkedin_message`       | text        | ≤300 characters                                                                                                       |
| `call_script`            | text        | 5 lines starting `- `                                                                                                 |
| `score`                  | integer     | 0–100. Capped at 40 when no stock is nearby                                                                           |
| `flags`                  | text[]      | e.g. `sourcing_opportunity`, `value_unknown`, `location_uncertain`, `draft_from_template`, `draft_unverified_numbers` |
| `status`                 | text        | See below                                                                                                             |
| `owner`                  | uuid        | `auth.users.id` of the owner, if assigned                                                                             |
| `notes`                  | text        |                                                                                                                       |
| `landing_page`           | text        | Form leads: first page the visitor landed on                                                                          |
| `utm`                    | jsonb       | Form leads: `{ "utm_source": "…", … , "gclid": "…" }`                                                                 |
| `synced_at`              | timestamptz | Free for the leads app to set when it has synced a row                                                                |

### Statuses

`new` → `researching` → `ready` → `contacted` → `replied` → `quoted` → `won` / `lost`, plus `do_not_contact`.

**`do_not_contact` is special:** Radar will not create new leads for any company with a `do_not_contact` lead (matched by Companies House number or by company name). The leads app should write this status when someone asks not to be contacted, and must not delete such leads.

### Writing back

The leads app may update `status`, `owner`, `notes`, contact fields and `synced_at` on `public.leads` (not the view) with the service-role key or as a `sales` user. Don't change `source`, `project_id` or the matching fields.

## Real-time options

### Webhook (push)

If the Vault secret `leads_webhook_url` is set, the database POSTs JSON to it whenever a lead is **created** or its **status changes** (other edits don't fire). Delivery is best-effort, one attempt, 5-second timeout, via `pg_net`. Poll `updated_at` as a backstop.

Headers: `Content-Type: application/json`, `X-StaysDirect-Event: insert` or `update`.

pg_net can't sign requests, so **put a long random token in the URL** (for example `https://leads.example.com/api/staysdirect-hook?token=…`) and reject requests without it.

```json
{
  "event": "lead.created",
  "previous_status": null,
  "lead": {
    "id": "0f3c5a3e-3f2a-4a86-9d4e-2c1d8b7f6a10",
    "created_at": "2026-10-01T06:04:12.381+00:00",
    "updated_at": "2026-10-01T06:04:12.381+00:00",
    "source": "radar",
    "company_name": "Kier Highways Limited",
    "companies_house_number": "01234567",
    "contact_name": null,
    "contact_role": null,
    "contact_email": null,
    "contact_phone": null,
    "company_website": null,
    "project_id": "6a2d…",
    "project_title": "A39 Bridgwater to Cannington Resurfacing and Drainage Improvements",
    "site_town": "Cannington",
    "site_postcode": "TA5 2LD",
    "est_workers": 18,
    "start_date": "2026-11-02",
    "value_gbp": 6150000,
    "matched_property_ids": ["…", "…", "…"],
    "nearest_property_miles": 0.8,
    "outreach_subject": "Crew houses near Cannington for the A39 resurfacing",
    "outreach_body": "Hi {first_name},\n\n…\n\nReply 'no thanks' and we won't contact you again",
    "linkedin_message": "…",
    "call_script": "- …\n- …\n- …\n- …\n- …",
    "score": 77,
    "flags": [],
    "status": "new",
    "owner": null,
    "notes": null,
    "landing_page": null,
    "utm": null,
    "synced_at": null
  }
}
```

A status change sends `"event": "lead.status_changed"` with `"previous_status": "new"` (for example) and the full updated `lead`.

### Supabase Realtime (subscribe)

`public.leads` is in the `supabase_realtime` publication. Realtime works on tables, not views, and respects RLS, so subscribe as a `sales`/`admin` user (or with the service-role key on a server):

```ts
supabase
  .channel("leads")
  .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
    // payload.new has the same columns as leads_export (plus ip_hash, which you can ignore)
  })
  .subscribe();
```

## Guarantees

- Outreach drafts are never sent by this system. The leads app (or a person) sends them.
- Column names above are stable. Additions will be documented here.
- `leads_export` never exposes `ip_hash` (a salted hash used only for form rate-limiting).
