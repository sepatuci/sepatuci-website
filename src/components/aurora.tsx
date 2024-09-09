"use client";

import { motion } from "framer-motion";
import React from "react";
import { AuroraBackground } from "./ui/aurora-background";
// import Stats from '@/components/stats'
import { HoverEffect } from "./ui/card-hover-effect";

export function AuroraBackgroundDemo() {
  return (
    <div>
        <AuroraBackground>
      <motion.div
        initial={{ opacity: 0.0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0,
          duration: 0.2,
          ease: "easeInOut",
        }}
        className="relative flex flex-col gap-4 items-center justify-center px-4"
      >
        <div className="text-3xl md:text-7xl font-bold dark:text-white text-center">
            UCI's Premier Entrepreneurship Fraternity
        </div>
        <div className="font-extralight text-base md:text-4xl dark:text-neutral-200 py-4">
          Founders. Innovators. Builders.
        </div>
        <button className="bg-black dark:bg-white rounded-full w-fit text-white dark:text-black px-4 py-2">
          Interested?
        </button>
      </motion.div>
    </AuroraBackground>
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
  