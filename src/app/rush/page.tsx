
import ContactSection from "@/components/RushComponents/contact";
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Rush | SEP at UCI",
  description: "Join our next recruitment cycle. Connect with fellow entrepreneurs and start your journey with SEP at UCI.",
}

export default function RushPage() {
  return (
    <main className="dark min-h-screen pt-20">
      <ContactSection />
    </main>
  );
}