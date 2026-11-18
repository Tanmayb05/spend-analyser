import { redirect } from "next/navigation";

// Plans and EMIs now live in the Transactions page (Plans / EMIs tabs). Keep old links working.
export default function PlansPage() {
  redirect("/transactions?tab=plans");
}
