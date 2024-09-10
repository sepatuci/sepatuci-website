import FocusCards from "@/components/startups"
import { BackgroundLinesDemo } from "@/components/startups_top";

export default function ItemPage({ params }: { params: { item: string } }) {
    return (
      <div>
        <h1 className='text-3xl font-semibold capitalize'>{params.item} Page</h1>
          <BackgroundLinesDemo/>
          <FocusCards />
      </div>
    );
  }