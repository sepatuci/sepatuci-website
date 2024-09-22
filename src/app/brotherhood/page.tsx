// import GallerySection from '@/components/BrotherhoodComponents/gallery';
import GallerySection from '@/components/BrotherhoodComponents/brotherhood-gallery';
import utahSquad from '../../assets/community/utahSquad.jpeg';
// import FocusCardsDemo from '@/components/BrotherhoodComponents/gallery-grid';

export default function ItemPage({ params }: { params: { item: string } }) {
    return (
        <main
            className="dark min-h-screen"
            style={{
                backgroundImage: `url(${utahSquad.src})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed',
            }}
        >
            <title>Brotherhood</title>

            {/* Centered title */}
            <section className="h-screen flex items-center justify-center">
                <div className="bg-black text-white rounded-full px-6 py-3 mb-4 text-center">
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold title-font">
                        SEP throughout the years
                    </h1>
                </div>
            </section>

            {/* Scrollable content */}
            <section className="min-h-screen">
                <GallerySection />
            </section>
        </main>
    );
}
