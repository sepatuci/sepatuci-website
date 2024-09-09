

import {RushTimeline} from '@/components/RushPage/rush-timeline';
import { Suspense } from 'react';

export default function ItemPage({ params }: { params: { item: string } }) {
    return (
      <div>
        <RushTimeline/>
      </div>
    );
  }