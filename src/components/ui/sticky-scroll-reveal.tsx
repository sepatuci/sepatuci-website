"use client";
import React, { useEffect, useRef, useState, useMemo } from "react";
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

  const biasFactorStart = 0.15;
  const biasFactorEnd = 0.45;

  const cardsBreakpoints = useMemo(() =>
    content.map((_, index) => {
      if (index === 0) return biasFactorStart;
      if (index === cardLength - 1) return 1 - biasFactorEnd;
      return biasFactorStart + (index / cardLength) * (1 - biasFactorStart - biasFactorEnd);
    }),
    [content.length, cardLength]
  );

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
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
  const linearGradients = useMemo(() => [
    "var(--black)",
    "var(--black)",
    "var(--black)",
  ], []);

  const [backgroundGradient, setBackgroundGradient] = useState(
    linearGradients[0]
  );

  useEffect(() => {
    setBackgroundGradient(linearGradients[activeCard % linearGradients.length]);
  }, [activeCard, linearGradients]);
  

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
            <div key={item.title + index} className="my-20 pt-[175px]">
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
                className="text-3xl text-slate-300 max-w-sm mt-20"
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
