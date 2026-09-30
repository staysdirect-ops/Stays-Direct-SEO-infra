"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Empty, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate } from "@/lib/utils";
import { addTopic, setTopicStatus, suggestTopicsNow, writeTopicNow } from "../actions";

export interface Topic {
  id: string;
  keyword: string;
  working_title: string;
  intent: string | null;
  source: string;
  priority: number;
  status: string;
  notes: string | null;
  created_at: string;
}

export function TopicsView({ topics }: { topics: Topic[] }) {
  const router = useRouter();
  const [kw, setKw] = useState("");
  const [title, setTitle] = useState("");
  const [intent, setIntent] = useState("informational");
  const refresh = (r: { ok: boolean }) => r.ok && router.refresh();
  return (
    <>
      <Card className="mb-4">
        <CardContent className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-end">
          <Field label="Keyword">
            <Input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="van parking contractor houses"
            />
          </Field>
          <Field label="Working title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Van parking when your crew works away"
            />
          </Field>
          <Field label="Intent">
            <Select value={intent} onChange={(e) => setIntent(e.target.value)}>
              <option>informational</option>
              <option>commercial</option>
              <option>transactional</option>
            </Select>
          </Field>
          <ActionButton
            action={() => addTopic(kw, title, intent)}
            onDone={(r) => r.ok && (setKw(""), setTitle(""), router.refresh())}
          >
            Add topic
          </ActionButton>
        </CardContent>
      </Card>
      <div className="mb-3">
        <ActionButton variant="outline" action={suggestTopicsNow} onDone={refresh}>
          Suggest 15 ideas now
        </ActionButton>
      </div>
      <Card>
        {topics.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Topic</TH>
                <TH className="hidden sm:table-cell">Source</TH>
                <TH className="hidden sm:table-cell">Priority</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {topics.map((t) => (
                <TR key={t.id}>
                  <TD className="max-w-md">
                    <p className="font-medium text-navy">{t.working_title}</p>
                    <p className="text-xs text-slate-500">
                      {t.keyword} · {t.intent ?? "—"} · {fmtDate(t.created_at)}
                    </p>
                    {t.notes ? <p className="text-xs text-red-700">{t.notes}</p> : null}
                  </TD>
                  <TD className="hidden sm:table-cell">{t.source}</TD>
                  <TD className="hidden sm:table-cell">{t.priority}</TD>
                  <TD>
                    <Badge>{t.status}</Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {t.status === "idea" || t.status === "queued" ? (
                        <ActionButton size="sm" action={() => writeTopicNow(t.id)} onDone={refresh}>
                          Write now
                        </ActionButton>
                      ) : null}
                      {t.status === "idea" ? (
                        <ActionButton
                          size="sm"
                          variant="outline"
                          action={() => setTopicStatus(t.id, "queued")}
                          onDone={refresh}
                        >
                          Queue
                        </ActionButton>
                      ) : null}
                      {t.status !== "rejected" && t.status !== "written" ? (
                        <ActionButton
                          size="sm"
                          variant="ghost"
                          action={() => setTopicStatus(t.id, "rejected")}
                          onDone={refresh}
                        >
                          Reject
                        </ActionButton>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <Empty>No topics yet.</Empty>
        )}
      </Card>
    </>
  );
}
