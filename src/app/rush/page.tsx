

import {RushTimeline} from "@/components/RushComponents/rush-timeline";
import { Suspense } from "react";

export default function ItemPage({ params }: { params: { item: string } }) {
    return (
      <main className="dark">
        <RushTimeline/>
      </main>
    );
  }