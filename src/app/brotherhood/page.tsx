import GallerySection from '@/components/BrotherhoodComponents/brotherhood-gallery';
import utahSquad from '../../assets/community/utahSquad.jpeg';
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Brotherhood | SEP at UCI",
  description: "Experience the bonds that unite our entrepreneurial community through shared experiences and lifelong connections.",
}

export default function BrotherhoodPage() {
    return (
        <main className="dark min-h-screen">
            {/* Hero Section */}
            <section 
                className="relative h-screen flex items-center justify-center"
                style={{
                    backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${utahSquad.src})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundAttachment: 'fixed',
                }}
            >
                <div className="text-center section-padding">
                    <div className="bg-background/80 backdrop-blur-sm rounded-3xl px-8 py-6 border border-border/50">
                        <h1 className="heading-1 text-foreground">
                            SEP Throughout the Years
                        </h1>
                        <p className="body-large mt-4">
                            Celebrating the bonds that unite our entrepreneurial family
                        </p>
                    </div>
                </div>
            </section>

            {/* Gallery Section */}
            <section className="bg-background">
                <GallerySection />
            </section>
        </main>
    );
}
