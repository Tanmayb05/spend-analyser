import { redirect } from "next/navigation";

// Plans & EMIs now lives in the Transactions page (Plans & EMIs tab). Keep old links working.
export default function PlansPage() {
  redirect("/transactions?tab=plans");
}
