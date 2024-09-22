// import GallerySection from '@/components/BrotherhoodComponents/gallery';
import GallerySection from '@/components/BrotherhoodComponents/brotherhood-gallery';
import utahSquad from '../../assets/community/utahSquad.jpeg';
// import FocusCardsDemo from '@/components/BrotherhoodComponents/gallery-grid';

export default function ItemPage({ params }: { params: { item: string } }) {
    return (
        <main
            className="dark min-h-screen"
            style={{
                backgroundImage: `url(${utahSquad.src})`, // Correct usage
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed',
            }}
        >
            <title>Brotherhood</title>

            {/* Centered title */}
            <section className="h-screen flex items-center justify-center">
                <div className="bg-black text-5xl font-bold title-font text-white rounded-full px-6 py-3 mb-4">
                    SEP throughout the years
                </div>
            </section>

            {/* Scrollable content */}
            <section className="min-h-screen">
            <GallerySection/>
            </section>
        </main>
    );
}
