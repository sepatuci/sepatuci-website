import FocusCards from '@/components/members'
import {ExpandableCardDemo} from '@/components/actives'
import { Suspense } from 'react';

export default function ItemPage({ params }: { params: { item: string } }) {
    return (
      <div>
        <h1 className='text-3xl font-semibold capitalize'>{params.item} Page</h1>
          <ExpandableCardDemo />


      </div>
    );
  }