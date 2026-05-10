import MainFE from "@/components/FEComponents/main-founders";
import ScrollStartups from "@/components/FEComponents/startups-scroll";
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Founder's Education",
  description: "Join SEP's 8-week startup incubator program at UCI. Learn ideation, validation, pitching, and fundraising from experienced founders. Build your first startup with hands-on mentorship.",
  keywords: ["UCI startup incubator", "founder's education program", "entrepreneurship course UCI", "startup bootcamp", "learn to build startups"],
  alternates: {
    canonical: "https://sepatuci.com/founderseducation",
  },
  openGraph: {
    title: "Founder's Education | SEP at UCI",
    description: "Join SEP's 8-week startup incubator program at UCI. Learn ideation, validation, pitching, and fundraising from experienced founders.",
    url: "https://sepatuci.com/founderseducation",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Founder's Education | SEP at UCI",
    description: "Join SEP's 8-week startup incubator program. Build your first startup with hands-on mentorship.",
  },
}

export default function FoundersEducationPage() {
  return (
    <main className="dark min-h-screen pt-20">
      <MainFE/>
      <ScrollStartups/>
    </main>
  );
}