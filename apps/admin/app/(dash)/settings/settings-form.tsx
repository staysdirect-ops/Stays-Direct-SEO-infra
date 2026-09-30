"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { saveSettings } from "./actions";

type S = Record<string, unknown>;

export function SettingsForm({ initial }: { initial: S }) {
  const [s, setS] = useState<S>({
    ...initial,
    radar_cpv_prefixes: (initial.radar_cpv_prefixes as string[]).join(", "),
    tracked_brand_names: (initial.tracked_brand_names as string[]).join(", "),
    competitor_names: (initial.competitor_names as string[]).join(", "),
  });
  const bind = (k: string) => ({
    value: String(s[k] ?? ""),
    onChange: (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value }),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Scheduling</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={s.crons_enabled === true}
              onChange={(e) => setS({ ...s, crons_enabled: e.target.checked })}
            />
            <span>
              <b>Run scheduled jobs.</b> Radar daily 06:00, pages 07:00, blog Mon/Wed/Fri 07:30,
              topics Monday, AI visibility Monday 05:00, refresh monthly (UK time). Turn on after
              the first-run checklist in docs/RUNBOOK.md.
            </span>
          </label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Radar</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Field label="Minimum value £">
            <Input type="number" {...bind("radar_min_value_gbp")} />
          </Field>
          <Field label="Match radius (miles)">
            <Input type="number" {...bind("radar_match_radius_miles")} />
          </Field>
          <Field
            label="CPV prefixes"
            className="col-span-2"
            hint="Comma separated. 45 construction, 71 engineering, 50 repair, 51 installation, 65 utilities, 76 oil & gas."
          >
            <Input {...bind("radar_cpv_prefixes")} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Content and AI</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Field label="Pages per day">
            <Input type="number" {...bind("seo_pages_per_day")} />
          </Field>
          <Field label="Blog posts per week">
            <Input type="number" {...bind("blog_posts_per_week")} />
          </Field>
          <Field
            label="Daily AI spend cap (USD)"
            hint="All AI calls stop for the day once reached."
          >
            <Input type="number" step="0.5" {...bind("daily_ai_spend_cap_usd")} />
          </Field>
          <Field label="Claude model">
            <Input {...bind("claude_model")} />
          </Field>
          <Field label="Cheap Claude model" hint="Sentiment only.">
            <Input {...bind("claude_cheap_model")} />
          </Field>
          <Field label="OpenAI model">
            <Input {...bind("openai_model")} />
          </Field>
          <Field label="Perplexity model">
            <Input {...bind("perplexity_model")} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Brand voice</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea rows={6} {...bind("brand_voice")} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Company facts (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea rows={12} className="font-mono text-xs" {...bind("company_facts")} />
          <p className="mt-1 text-xs text-slate-500">
            The only company claims AI copy may make: phone, bedrooms range, credit terms, hotel
            saving range, inclusions.
          </p>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>AI visibility names</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label="Our brand names">
            <Input {...bind("tracked_brand_names")} />
          </Field>
          <Field label="Competitors">
            <Input {...bind("competitor_names")} />
          </Field>
        </CardContent>
      </Card>
      <div className="lg:col-span-2">
        <ActionButton action={() => saveSettings(s)}>Save settings</ActionButton>
      </div>
    </div>
  );
}
