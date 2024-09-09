import Community from '@/components/community'
import { AuroraBackgroundDemo } from '@/components/aurora'
import FoundersEducation from '@/components/founders'



export default function Home() {
  return (
    <main>
      <div>
        <AuroraBackgroundDemo />
        
        <Community />
      </div>
    </main>
  );
}