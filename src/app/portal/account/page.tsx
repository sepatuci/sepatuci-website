import type { Metadata } from "next";
import AccountPanel from "@/components/PortalComponents/account-panel";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return <AccountPanel />;
}
