import Community from "@/components/LandingComponents/community"
import { AuroraBackgroundDemo } from "@/components/LandingComponents/aurora"
// import FoundersEducation from "@/components/founders"
import { StickyScrollRevealDemo } from "../components/LandingComponents/main-page-scroll";
import TestimonialSection from "@/components/LandingComponents/fe-testemonial";



export default function Home() {
  return (
    <main className="dark">
      <div>
        <title>SEP at UCI</title>
        <AuroraBackgroundDemo />
        <StickyScrollRevealDemo/>
        <br/>
        <br/>
        <br/>
        <br/>
        {/* for mobile display  */}
        <br/>
        <br/>
        <br/>
        <br/>
        <TestimonialSection/>
        <Community />
      </div>
    </main>
  );
}