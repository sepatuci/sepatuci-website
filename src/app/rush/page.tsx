

import {RushTimeline} from "@/components/RushComponents/rush-timeline";
import { Suspense } from "react";

export default function ItemPage({ params }: { params: { item: string } }) {
    return (
      <main className="dark">
        <title>Fall &apos;24 Rush</title>
        <RushTimeline/>
      </main>
    );
  }