"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { useAction } from "@/hooks/use-action";
import { allCurrencies, currencyName, formatMoney } from "@/lib/money";
import { updatePreferences } from "@/app/(app)/settings/actions";
import type { Profile } from "@/lib/data/types";

const noop = () => () => {};

export function PreferencesForm({ profile, txnCount }: { profile: Profile; txnCount: number }) {
  const [v, setV] = useState({
    base_currency: profile.base_currency,
    locale: profile.locale,
    timezone: profile.timezone,
    week_start: profile.week_start,
    theme: profile.theme as "dark" | "light" | "system",
    dashboard_mode: profile.dashboard_mode,
    default_spread_months: profile.default_spread_months,
  });
  const [convertBudgets, setConvertBudgets] = useState(true);
  const a = useAction();
  const currencies = useMemo(() => allCurrencies().map((c) => ({ code: c, name: currencyName(c) })), []);
  // timezone list + device zone come from the browser only (server ICU differs)
  const zonesKey = useSyncExternalStore(noop, () => "client", () => "server");
  const zones = useMemo(
    () => (zonesKey === "client" && typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [profile.timezone]),
    [zonesKey, profile.timezone],
  );
  const deviceZone = zonesKey === "client" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
  const currencyChanged = v.base_currency !== profile.base_currency;
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        a.run(() => updatePreferences({ ...v, convert_budgets: currencyChanged && convertBudgets }));
      }}
    >
      <Card>
        <CardHeader title="Money" />
        <div className="space-y-4">
          <Field label="Default currency" htmlFor="ccy" hint={`Example: ${formatMoney(123456.78, v.base_currency)}. INR uses lakh grouping automatically.`}>
            <Select id="ccy" value={v.base_currency} onChange={(e) => set("base_currency", e.target.value)}>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
              ))}
            </Select>
          </Field>
          {currencyChanged && txnCount > 0 ? (
            <div className="rounded-2xl bg-warn/10 p-4 text-sm text-warn">
              <p>All {txnCount} transactions will be converted to {v.base_currency} using each day&apos;s exchange rate. Original amounts are kept.</p>
              <label className="mt-3 flex items-center gap-2 text-text">
                <input type="checkbox" checked={convertBudgets} onChange={(e) => setConvertBudgets(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
                Also convert budgets at today&apos;s rate
              </label>
            </div>
          ) : null}
          <Field label="Spread new purchases over (months, default)" htmlFor="dsm">
            <Input id="dsm" type="number" min={1} max={120} value={v.default_spread_months} onChange={(e) => set("default_spread_months", Number(e.target.value))} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Dashboard" />
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-muted">Default view</p>
            <Segmented
              value={v.dashboard_mode}
              onChange={(m) => set("dashboard_mode", m)}
              options={[
                { value: "normalized", label: "Normalized" },
                { value: "cash", label: "Cash" },
              ]}
            />
            <p className="mt-2 text-xs text-faint">Normalized spreads EMIs and big purchases across months. Cash shows money on the day it left.</p>
          </div>
          <div>
            <p className="mb-2 text-sm text-muted">Week starts on</p>
            <Segmented
              value={String(v.week_start) as "0" | "1"}
              onChange={(w) => set("week_start", Number(w))}
              options={[
                { value: "1", label: "Monday" },
                { value: "0", label: "Sunday" },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Display" />
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-muted">Theme</p>
            <Segmented
              value={v.theme}
              onChange={(t) => set("theme", t)}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
                { value: "system", label: "System" },
              ]}
            />
          </div>
          <Field label="Timezone" htmlFor="tz" hint="Decides what counts as 'today' and which payments are still scheduled.">
            <Select id="tz" value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {!zones.includes(v.timezone) ? <option value={v.timezone}>{v.timezone}</option> : null}
              {zones.map((z) => (
                <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </Field>
          {deviceZone && v.timezone !== deviceZone ? (
            <Button variant="ghost" size="sm" onClick={() => set("timezone", deviceZone)}>
              Use this device&apos;s timezone ({deviceZone})
            </Button>
          ) : null}
        </div>
      </Card>

      <Button type="submit" size="lg" disabled={a.pending} className="w-full sm:w-auto">
        {a.pending ? (currencyChanged ? "Converting…" : "Saving…") : "Save preferences"}
      </Button>
    </form>
  );
}
