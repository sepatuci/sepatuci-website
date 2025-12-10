import Community from "@/components/LandingComponents/community"
import LandingHero from "@/components/LandingComponents/landing-hero"
import LandingPillars from "@/components/LandingComponents/landing-pillars"
import { StickyScrollRevealDemo } from "../components/LandingComponents/main-page-scroll";
import TestimonialSection from "@/components/LandingComponents/fe-testemonial";
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "SEP at UCI | Premier Entrepreneurship Fraternity",
  description: "Join UCI's premier entrepreneurship fraternity. Build startups, connect with founders, and transform your ideas into reality.",
  openGraph: {
    title: "SEP at UCI | Premier Entrepreneurship Fraternity",
    description: "UCI's Home for Builders. Build startups, connect with founders, and transform your ideas into reality.",
    type: "website",
    siteName: "Sigma Eta Pi at UCI",
  },
  twitter: {
    card: "summary_large_image",
    title: "SEP at UCI | Premier Entrepreneurship Fraternity",
    description: "UCI's Home for Builders. Build startups, connect with founders, and transform your ideas into reality.",
  },
}

export default function Home() {
  return (
    <main className="dark min-h-screen">
      <LandingHero />
      <div className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24">
        <StickyScrollRevealDemo/>
      </div>
      <div className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24">
        <TestimonialSection/>
      </div>
      <div className="section-margin">
        <Community />
      </div>
    </main>
  );
}