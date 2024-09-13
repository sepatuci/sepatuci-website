
import MainFE from "@/components/FEComponents/main-founders";
import ScrollStartups from "@/components/FEComponents/startups-scroll";
// import TestimonialSection from "@/components/FEPage/testimonial-founders";
import { Suspense } from "react";

export default function ItemPage({ params }: { params: { item: string } }) {
    return (
      <main className="dark">
        <MainFE/>
        <ScrollStartups/>
      </main>
    );
  }