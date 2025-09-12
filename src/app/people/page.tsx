import TeamSection from "@/components/PeopleComponents/people-grid"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Our Community | SEP at UCI",
  description: "Meet the exceptional individuals who make up our entrepreneurial community",
}

export default function PeoplePage() {
  return (
    <div className="dark min-h-screen pt-20">
      <TeamSection />
    </div>
  );
}