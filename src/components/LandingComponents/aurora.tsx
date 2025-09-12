"use client";

import { motion } from "framer-motion";
import React from "react";
import { AuroraBackground } from "../ui/aurora-background";

export function AuroraBackgroundDemo() {
  const words = ["Founders", "Innovators", "Builders"];
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
          <h1 className="text-6xl sm:text-7xl lg:text-9xl font-light tracking-tight dark:text-white text-center">
            Sigma Eta Pi
          </h1>
          <p className="body-large dark:text-white text-center">
            UCI&apos;s Premier Entrepreneurship Fraternity
          </p>
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
      title: "$2M+",
      description:
        "In Funding",
    },
    {
      title: "1",
      description:
        "Family",
    },
  ];
  