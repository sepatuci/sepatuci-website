"use client";
import React, { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useScroll } from "framer-motion";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const StickyScroll = ({
  content,
  contentClassName,
}: {
  content: {
    title: string;
    description: string;
    content?: React.ReactNode | any;
  }[];
  contentClassName?: string;
}) => {
  const [activeCard, setActiveCard] = React.useState(0);
  const ref = useRef<any>(null);
  const { scrollYProgress } = useScroll({
    // Use the main page scroll by not providing a target or container.
    offset: ["start start", "end start"],
  });
  const cardLength = content.length;

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const biasFactorStart = 0.28;  // Bias factor for the first card (larger value = more scroll time)
    const biasFactorEnd = 0.55;    // Bias factor for the last card
    const cardLength = content.length;
  
    // Define custom breakpoints to allocate more scroll time for the first and last cards
    const cardsBreakpoints = content.map((_, index) => {
      if (index === 0) {
        // First card gets more scroll space
        return biasFactorStart;
      } else if (index === cardLength - 1) {
        // Last card gets more scroll space
        return 1 - biasFactorEnd;
      } else {
        // Middle cards share the remaining space evenly
        return biasFactorStart + (index / cardLength) * (1 - biasFactorStart - biasFactorEnd);
      }
    });
  
    const closestBreakpointIndex = cardsBreakpoints.reduce(
      (acc, breakpoint, index) => {
        const distance = Math.abs(latest - breakpoint);
        if (distance < Math.abs(latest - cardsBreakpoints[acc])) {
          return index;
        }
        return acc;
      },
      0
    );
    setActiveCard(closestBreakpointIndex);
  });
  
  

  const backgroundColors = [
    "var(--black)",
    "var(--black)",
    "var(--black)",
  ];
  const linearGradients = [
    "var(--black)",
    "var(--black)",
    "var(--black)",
  ];

  const [backgroundGradient, setBackgroundGradient] = useState(
    linearGradients[0]
  );

  useEffect(() => {
    setBackgroundGradient(linearGradients[activeCard % linearGradients.length]);
  }, [activeCard]);

  return (
    <motion.div
      animate={{
        backgroundColor: backgroundColors[activeCard % backgroundColors.length],
      }}
      className="flex justify-center relative space-x-10 rounded-md p-10"
      ref={ref}
    >
      <div className="div relative flex items-start px-4">
        <div className="max-w-2xl">
          {content.map((item, index) => (
            <div key={item.title + index} className="my-20">
              <motion.h2
                initial={{
                  opacity: 0,
                }}
                animate={{
                  opacity: activeCard === index ? 1 : 0.3,
                }}
                className="text-5xl font-bold text-slate-100"
              >
                {item.title}
              </motion.h2>
              <motion.p
                initial={{
                  opacity: 0,
                }}
                animate={{
                  opacity: activeCard === index ? 1 : 0.3,
                }}
                className="text-3xl text-slate-300 max-w-sm mt-10"
              >
                {item.description}
              </motion.p>
            </div>
          ))}
          <div className="h-40" />
        </div>
      </div>
      <div
        style={{
          background: backgroundGradient,
          transform: "translateY(10%)",
        }}
        className={cn(
          "hidden lg:block h-[600px] w-[800px] rounded-md bg-white sticky top-40 overflow-hidden", // Increased size here
          contentClassName
        )}
      >
        {content[activeCard].content ?? null}
      </div>

    </motion.div>
  );
};
