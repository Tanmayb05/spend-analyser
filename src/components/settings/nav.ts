import { Activity, Bot,Database, FolderTree, PiggyBank, Shield, SlidersHorizontal, Store, User, Users, Wallet, Wand2 } from "lucide-react";

/**
 * Settings pages grouped under headings. Headings are labels only (not pages); each item is the real page.
 * The "Transaction setup" group holds everything that shapes the options offered when adding a transaction.
 */
export const SETTINGS_GROUPS = [
  {
    id: "transaction-setup",
    title: "Transaction setup",
    items: [
      { href: "/settings/categories", label: "Categories", desc: "Categories, subcategories, core flag", icon: FolderTree },
      { href: "/settings/budgets", label: "Budgets", desc: "Monthly budgets per category", icon: PiggyBank },
      { href: "/settings/payments", label: "Payment methods", desc: "Cards, cash, wallets", icon: Wallet },
      { href: "/settings/merchants", label: "Merchants", desc: "Rename, merge, default category", icon: Store },
      { href: "/settings/people", label: "People", desc: "Who paid", icon: Users },
    ],
  },
  {
    id: "account",
    title: "Account",
    items: [
      { href: "/settings/profile", label: "Profile", desc: "Name and email", icon: User },
      { href: "/settings/security", label: "Security", desc: "Password, sessions, delete account", icon: Shield },
    ],
  },
  {
    id: "app",
    title: "App",
    items: [
      { href: "/settings/preferences", label: "Preferences", desc: "Currency, number format, theme, defaults", icon: SlidersHorizontal },
      { href: "/settings/ai", label: "AI", desc: "AI provider, usage and limits", icon: Bot },
      { href: "/settings/ai/usage", label: "AI usage", desc: "Calls, tokens, time and cost per feature", icon: Activity },
    ],
  },
  {
    id: "data",
    title: "Data",
    items: [
      { href: "/settings/data", label: "Import & export", desc: "Excel / CSV in and out", icon: Database },
      { href: "/settings/tidy", label: "AI tidy-up", desc: "Fix categories, merchants, item names", icon: Wand2 },
    ],
  },
] as const;
