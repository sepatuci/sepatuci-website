import { redirect } from "next/navigation";

/** Actives are managed with everyone else now, on the People page. */
export default function AdminActivesPage() {
  redirect("/portal/admin/people");
}
