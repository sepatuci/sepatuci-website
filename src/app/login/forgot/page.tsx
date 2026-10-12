import type { Metadata } from "next";
import AuthShell from "@/components/PortalAuthComponents/auth-shell";
import ForgotForm from "@/components/PortalAuthComponents/forgot-form";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotForm />
    </AuthShell>
  );
}
