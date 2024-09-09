'use client';

import { HoverEffect } from "./ui/card-hover-effect";

export default function Stats() {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center max-w-5xl mx-auto px-8">
      <h1 className="lg:text-6xl text-4xl font-semibold text-center text-gray-800 dark:text-white">
        Sigma Eta Pi is a tight-knit community focused on making an impact in our communities. We do things
        differently at SEP.      </h1>
      <p className="lg:text-2xl lg:max-w-5xl max-w-3xl mx-auto mt-4 text-center text-gray-500 xl:mt-6 dark:text-gray-300">

      </p>
      <HoverEffect items={projects} />
    </div>
  );
}
export const projects = [
  {
    title: "40+",
    description:
      "Community Members",
  },
  {
    title: "15+",
    description:
      "Majors",
  },
  {
    title: "20+",
    description:
      "Startups",
  },
  {
    title: "10+",
    description:
      "Countries",
  },
  {
    title: "$1M+",
    description:
      "In Funding",
  },
  {
    title: "1",
    description:
      "Family",
  },
];
