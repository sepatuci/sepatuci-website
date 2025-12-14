import TeamSection from "@/components/PeopleComponents/people-grid"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Our Community",
  description: "Meet the founders, builders, and entrepreneurs of Sigma Eta Pi at UCI. Our diverse community includes students from all majors united by their passion for innovation and startups.",
  keywords: ["SEP members", "UCI entrepreneurs", "Sigma Eta Pi community", "UCI startup founders", "entrepreneurship students"],
  alternates: {
    canonical: "https://sepatuci.com/people",
  },
  openGraph: {
    title: "Our Community | SEP at UCI",
    description: "Meet the founders, builders, and entrepreneurs of Sigma Eta Pi at UCI. Our diverse community includes students united by their passion for innovation.",
    url: "https://sepatuci.com/people",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Our Community | SEP at UCI",
    description: "Meet the founders, builders, and entrepreneurs of Sigma Eta Pi at UCI.",
  },
}

export default function PeoplePage() {
  return (
    <div className="dark min-h-screen pt-20">
      <TeamSection />
    </div>
  );
}