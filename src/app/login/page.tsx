import { Suspense } from "react";
import type { Metadata } from "next";
import AuthShell from "@/components/PortalAuthComponents/auth-shell";
import LoginFlow from "@/components/PortalAuthComponents/login-flow";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the Founder's Education portal for Sigma Eta Pi at UC Irvine.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <LoginFlow />
      </Suspense>
    </AuthShell>
  );
}
