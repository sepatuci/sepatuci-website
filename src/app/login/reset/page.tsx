import { Suspense } from "react";
import type { Metadata } from "next";
import AuthShell from "@/components/PortalAuthComponents/auth-shell";
import ResetForm from "@/components/PortalAuthComponents/reset-form";

export const metadata: Metadata = {
  title: "Choose a password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
