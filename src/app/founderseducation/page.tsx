
import Section from "@/components/FEComponents/fevp-section";
import MainFE from "@/components/FEComponents/main-founders";
import ScrollStartups from "@/components/FEComponents/startups-scroll";
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Founder's Education | SEP at UCI",
  description: "Join our 8-week startup incubator program. Learn to think and build like an entrepreneur through hands-on experience.",
}

export default function FoundersEducationPage() {
  return (
    <main className="dark min-h-screen pt-20">
      <MainFE/>
      <Section/>
      <ScrollStartups/>
    </main>
  );
}