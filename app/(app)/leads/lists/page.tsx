import { redirect } from "next/navigation";

/** Lists now live on /leads — keep this route as a redirect. */
export default function LeadListsPage() {
  redirect("/leads");
}
