
import MainFE from '@/components/FEPage/main-founders';
import ScrollStartups from '@/components/FEPage/startups-scroll';
// import TestimonialSection from '@/components/FEPage/testimonial-founders';
import { Suspense } from 'react';

export default function ItemPage({ params }: { params: { item: string } }) {
    return (
      <div>
        <MainFE/>
        <ScrollStartups/>
      </div>
    );
  }