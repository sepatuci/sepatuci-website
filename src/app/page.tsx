import Community from '@/components/LandingPage/community'
import { AuroraBackgroundDemo } from '@/components/LandingPage/aurora'
import FoundersEducation from '@/components/founders'
import { StickyScrollRevealDemo } from '../components/LandingPage/main-page-scroll';
import TestimonialSection from '@/components/LandingPage/fe-testemonial';



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