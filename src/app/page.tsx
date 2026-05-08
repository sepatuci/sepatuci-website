import dynamic from "next/dynamic";
import { Metadata } from "next"

const LandingHero = dynamic(
  () => import("@/components/LandingComponents/landing-hero")
);

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
    </main>
  );
}