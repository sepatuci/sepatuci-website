import TeamSection from "@/components/PeopleComponents/people-grid"
// import { Suspense } from "react";

export default function ItemPage({ params }: { params: { item: string } }) {
    return (
      <div>
        <h1 className='text-3xl font-semibold capitalize'>{params.item} Page</h1>
        <title>Our Community</title>
          <TeamSection />
      </div>
    );
  }