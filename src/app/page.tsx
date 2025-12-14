import Community from "@/components/LandingComponents/community"
import LandingHero from "@/components/LandingComponents/landing-hero"
import LandingPillars from "@/components/LandingComponents/landing-pillars"
import { StickyScrollRevealDemo } from "../components/LandingComponents/main-page-scroll";
import TestimonialSection from "@/components/LandingComponents/fe-testemonial";
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "SEP at UCI | UCI's Startup Community for Student Founders",
  description: "UCI's startup community for student founders. Launch your startup, learn from experienced entrepreneurs, and join 40+ UCI students building companies. 20+ startups launched, $1M+ funding raised. Open to all majors.",
  keywords: ["UCI startups", "startup clubs UCI", "UCI entrepreneurship", "student founders UCI", "Irvine startup incubator", "UCI founder community", "how to start a startup at UCI", "Sigma Eta Pi"],
  alternates: {
    canonical: "https://sepatuci.com",
  },
  openGraph: {
    title: "SEP at UCI | UCI's Startup Community for Student Founders",
    description: "UCI's startup community for student founders. 40+ members, 20+ startups launched, $1M+ funding raised. Join UCI's home for builders.",
    type: "website",
    siteName: "Sigma Eta Pi at UCI",
  },
  twitter: {
    card: "summary_large_image",
    title: "SEP at UCI | UCI's Startup Community for Student Founders",
    description: "UCI's startup community for student founders. 40+ members, 20+ startups launched, $1M+ funding raised.",
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