"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { setPassword } from "./actions";

export function PasswordForm() {
  const [password, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="New password" htmlFor="pw" hint="At least 10 characters.">
          <Input
            id="pw"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPw(e.target.value)}
          />
        </Field>
        <Field label="Confirm" htmlFor="pw2">
          <Input
            id="pw2"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <ActionButton
          disabled={!password}
          action={() => setPassword(password, confirm)}
          onDone={(r) => {
            if (r.ok) {
              setPw("");
              setConfirm("");
            }
          }}
        >
          Save password
        </ActionButton>
      </CardContent>
    </Card>
  );
}
