"use client";

// import ZetaDemoDay from "../../assets/community/ZetaDemoDay.jpeg";
import MeetTheChapter from "@/assets/rush-fall-2024/Meet The Chapter Deck.png";
import PitchNight from "@/assets/rush-fall-2024/Pitch Night Slide Deck.png";
import Jareice from "@/assets/community/Jareice.jpeg"
import peterAnteater from "@/assets/community/PeterAnteater.jpeg"
import CalebAndAriya from "@/assets/community/PitchNight.jpeg"
import BeachBonfire from "@/assets/community/beachBonfireHomies.jpeg"


import Image from "next/image";
import React from "react";
import { Timeline } from "@/components/ui/timeline";

interface TimelineEntry {
  title: React.JSX.Element;
  content: React.JSX.Element;
}

export function RushTimeline() {
  const data = [
    {
      title: (
        <span className="text-white">Anteater Involvement Fair 09/23/2024</span>
      ),
      content: (
        <div>
          <div className="grid grid-cols-2 gap-4">
            <Image
              src={Jareice.src}
              alt="startup template"
              width={500}
              height={500}
              className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
            />
          </div>
        </div>
      ),
    },
    {
      title: (
        <span className="text-white">Meet the Chapter 09/30/2024</span>
      ),
      content: (
        <div>
          <div className="grid grid-cols-2 gap-4">
            <Image
              src={peterAnteater.src}
              alt="startup template"
              width={500}
              height={500}
              className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
            />
          </div>
        </div>
      ),
    },
    {
      title: (
        <span className="text-white">Pitch Night 10/02/2024</span>
      ),
      content: (
        <div>
          <div className="grid grid-cols-2 gap-4">
            <Image
              src={CalebAndAriya.src}
              alt="hero template"
              width={500}
              height={500}
              className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
            />
          </div>
        </div>
      ),
    },
    {
      title: (
        <span className="text-white">Bonfire Social 10/04/2024</span>
      ),
      content: (
        <div>
          <div className="grid grid-cols-2 gap-4">
            <Image
              src={BeachBonfire.src}
              alt="hero template"
              width={500}
              height={500}
              className="rounded-lg object-cover h-20 md:h-44 lg:h-60 w-full shadow-[0_0_24px_rgba(34,_42,_53,_0.06),_0_1px_1px_rgba(0,_0,_0,_0.05),_0_0_0_1px_rgba(34,_42,_53,_0.04),_0_0_4px_rgba(34,_42,_53,_0.08),_0_16px_68px_rgba(47,_48,_55,_0.05),_0_1px_0_rgba(255,_255,_255,_0.1)_inset]"
            />
          </div>
        </div>
      ),
    },
  ];
  return (
    <div className="w-full">
      <Timeline data={data} />
    </div>
  );
}
