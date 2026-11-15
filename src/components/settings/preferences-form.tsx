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

/** A short list of common zones with plain names; the stored value is still the IANA id. */
const TIMEZONES: [id: string, label: string][] = [
  ["Pacific/Honolulu", "Hawaii"],
  ["America/Anchorage", "Alaska"],
  ["America/Los_Angeles", "Pacific Time (US)"],
  ["America/Denver", "Mountain Time (US)"],
  ["America/Chicago", "Central Time (US)"],
  ["America/New_York", "Eastern Time (US)"],
  ["America/Toronto", "Toronto"],
  ["America/Sao_Paulo", "Brasília"],
  ["Europe/London", "London"],
  ["Europe/Paris", "Central Europe (Paris, Berlin)"],
  ["Europe/Athens", "Eastern Europe (Athens)"],
  ["Europe/Moscow", "Moscow"],
  ["Africa/Cairo", "Cairo"],
  ["Africa/Lagos", "West Africa (Lagos)"],
  ["Africa/Johannesburg", "South Africa"],
  ["Asia/Dubai", "Dubai"],
  ["Asia/Kolkata", "India (Mumbai, Delhi)"],
  ["Asia/Dhaka", "Dhaka"],
  ["Asia/Bangkok", "Bangkok"],
  ["Asia/Singapore", "Singapore"],
  ["Asia/Shanghai", "China"],
  ["Asia/Tokyo", "Tokyo"],
  ["Australia/Sydney", "Sydney"],
  ["Pacific/Auckland", "New Zealand"],
];
const cityOf = (id: string) => id.split("/").pop()!.replace(/_/g, " ");

export function PreferencesForm({ profile, txnCount }: { profile: Profile; txnCount: number }) {
  const [v, setV] = useState({
    base_currency: profile.base_currency,
    locale: profile.locale,
    timezone: profile.timezone,
    week_start: profile.week_start,
    theme: profile.theme as "dark" | "light" | "system",
    default_spread_months: profile.default_spread_months,
  });
  const [convertBudgets, setConvertBudgets] = useState(true);
  const a = useAction();
  const currencies = useMemo(() => allCurrencies().map((c) => ({ code: c, name: currencyName(c) })), []);
  // the device's zone comes from the browser only (the server's differs)
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  const deviceZone = isClient ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
  const known = new Set(TIMEZONES.map(([id]) => id));
  // offered first: this device's zone; also keep whatever is saved even if it isn't in the short list
  const extra = [deviceZone, v.timezone].filter((z, i, a): z is string => Boolean(z) && !known.has(z!) && a.indexOf(z) === i);
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
              {extra.map((z) => (
                <option key={z} value={z}>{z === deviceZone ? `This device (${cityOf(z)})` : cityOf(z)}</option>
              ))}
              {TIMEZONES.map(([id, label]) => (
                <option key={id} value={id}>{id === deviceZone ? `${label} · this device` : label}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Button type="submit" size="lg" disabled={a.pending} className="w-full sm:w-auto">
        {a.pending ? (currencyChanged ? "Converting…" : "Saving…") : "Save preferences"}
      </Button>
    </form>
  );
}
