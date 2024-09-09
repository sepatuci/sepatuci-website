import Community from '@/components/community'
import { AuroraBackgroundDemo } from '@/components/aurora'
import FoundersEducation from '@/components/founders'
import { StickyScrollRevealDemo } from '../components/main-page-scroll';
import TestimonialSection from '@/components/fe-testemonial';



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