

import ContactSection from "@/components/RushComponents/contact";
import {RushTimeline} from "@/components/RushComponents/rush-timeline";

export default function ItemPage({ params }: { params: { item: string } }) {
    return (
      <main className="dark">
        <title>Fall &apos;24 Rush</title>
        <ContactSection />
        <RushTimeline/>
      </main>
    );
  }