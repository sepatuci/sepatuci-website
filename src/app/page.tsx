import Community from '@/components/LandingComponents/community'
import { AuroraBackgroundDemo } from '@/components/LandingComponents/aurora'
import FoundersEducation from '@/components/founders'
import { StickyScrollRevealDemo } from '../components/LandingComponents/main-page-scroll';
import TestimonialSection from '@/components/LandingComponents/fe-testemonial';



export default function Home() {
  return (
    <main>
      <div>
        <AuroraBackgroundDemo />
        <StickyScrollRevealDemo/>
        <TestimonialSection/>
        <Community />
      </div>
    </main>
  );
}