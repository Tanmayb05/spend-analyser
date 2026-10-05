import { Bot, Database, FolderTree, PiggyBank, Shield, SlidersHorizontal, Store, User, Users, Wallet } from "lucide-react";

export const SETTINGS_NAV = [
  { href: "/settings/profile", label: "Profile", desc: "Name and email", icon: User },
  { href: "/settings/preferences", label: "Preferences", desc: "Currency, number format, theme, defaults", icon: SlidersHorizontal },
  { href: "/settings/categories", label: "Categories", desc: "Categories, subcategories, core flag", icon: FolderTree },
  { href: "/settings/budgets", label: "Budgets", desc: "Monthly budgets per category", icon: PiggyBank },
  { href: "/settings/payments", label: "Payment methods", desc: "Cards, cash, wallets", icon: Wallet },
  { href: "/settings/people", label: "People", desc: "Who paid", icon: Users },
  { href: "/settings/merchants", label: "Merchants", desc: "Rename, merge, default category", icon: Store },
  { href: "/settings/ai", label: "AI", desc: "Gemini usage and limits", icon: Bot },
  { href: "/settings/data", label: "Import & export", desc: "Excel / CSV in and out", icon: Database },
  { href: "/settings/security", label: "Security", desc: "Password, sessions, delete account", icon: Shield },
] as const;
