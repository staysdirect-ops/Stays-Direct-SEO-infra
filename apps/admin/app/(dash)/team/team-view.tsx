"use client";

import { useState, useTransition } from "react";
import { ActionButton } from "@/components/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ActionResult } from "@/lib/actions";
import type { Role } from "@/lib/auth";
import { inviteMember, setMemberRole, type TeamMember } from "./actions";

const ROLES: Role[] = ["sales", "editor", "admin"];

function when(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

function RoleSelect({ member, isMe }: { member: TeamMember; isMe: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <Select
        aria-label={`Role for ${member.email ?? member.id}`}
        className="w-36"
        value={member.role ?? ""}
        disabled={pending || isMe}
        title={isMe ? "You can't change your own role" : undefined}
        onChange={(e) => {
          const role = (e.target.value || null) as Role | null;
          if (!role && !window.confirm(`Remove all access for ${member.email}?`)) return;
          start(async () => setResult(await setMemberRole(member.id, role)));
        }}
      >
        <option value="">No access</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </Select>
      {result ? (
        <span
          role="status"
          className={result.ok ? "text-xs text-emerald-700" : "text-xs text-red-700"}
        >
          {result.ok ? result.message : result.error}
        </span>
      ) : null}
    </span>
  );
}

export function TeamView({ members, myId }: { members: TeamMember[]; myId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("sales");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Email" htmlFor="invite-email" className="min-w-60 flex-1">
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@staysdirect.co.uk"
              />
            </Field>
            <Field label="Role" htmlFor="invite-role">
              <Select
                id="invite-role"
                className="w-36"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <ActionButton
              disabled={!email.includes("@")}
              action={() => inviteMember(email.trim(), role)}
              onDone={(r) => r.ok && setEmail("")}
            >
              Send invite
            </ActionButton>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            They get an email from Supabase Auth with a link to set their password. If they already
            have an account, their role is just updated.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Last sign-in</TH>
              </TR>
            </THead>
            <TBody>
              {members.map((m) => (
                <TR key={m.id}>
                  <TD className="font-medium">
                    {m.email ?? m.id}
                    {m.id === myId ? (
                      <span className="ml-2 text-xs text-slate-500">(you)</span>
                    ) : null}
                  </TD>
                  <TD>
                    <RoleSelect member={m} isMe={m.id === myId} />
                  </TD>
                  <TD>
                    {m.confirmed ? (
                      <Badge tone="success">active</Badge>
                    ) : (
                      <Badge tone="draft">{m.invited_at ? "invited" : "unconfirmed"}</Badge>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-slate-600">{when(m.last_sign_in_at)}</TD>
                </TR>
              ))}
              {!members.length ? (
                <TR>
                  <TD colSpan={4} className="text-slate-500">
                    No users yet.
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
