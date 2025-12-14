"use client";
import React from "react";
import { StickyScroll } from "../ui/sticky-scroll-reveal";
import Image from "next/image";

import sittingOnRock from "@/assets/community/utahSittingOnRock.jpeg";

const content = [
  {
    title: "Innovators",
    description:
      "We build startups every quarter through our Founder's Education program—UCI's student-run startup incubator. Learn ideation, validation, and pitching while launching real products. Innovation is at the core of our mission as we work towards launching UCI's next unicorn.",
    content: (
      <div className="flex items-center justify-center text-white">
        <Image
          src={require("../../assets/community/grouppic.jpeg")}
          width={800}
          height={600}
          className="object-cover rounded-lg"
          alt="SEP at UCI members collaborating on startup projects"
        />
      </div>
    ),
  },
  {
    title: "Creators",
    description:
      "UCI student founders in SEP have raised over $1M+ in VC funding, accelerator programs, and pitch competitions. From AI tools to consumer apps, our members build startups that solve real problems and create lasting impact in the Irvine startup ecosystem.",
    content: (
      <div className="flex items-center justify-center text-white">
        <Image
          src={require("../../assets/community/aifinals.jpeg")}
          width={800}
          height={600}
          className="object-cover rounded-lg"
          alt="SEP members presenting at UCI startup pitch competition"
        />
      </div>
    ),
  },
  {
    title: "Community",
    description:
      "At the core of Sigma Eta Pi is a tight-knit community of UCI entrepreneurs. We build startups together, go on retreats, and push each other to new heights. Open to all majors—CS, business, design, engineering, and more. It's the people that make SEP special.",
    content: (
      <div className="flex items-center justify-center text-white">
        <Image
          src={sittingOnRock}
          width={800}
          height={600}
          className="object-cover rounded-lg"
          alt="SEP at UCI brotherhood retreat in Utah"
        />
      </div>
    ),
  },
];

export function StickyScrollRevealDemo() {
  return (
    <div className="p-10">
      <StickyScroll content={content} />
    </div>
  );
}
