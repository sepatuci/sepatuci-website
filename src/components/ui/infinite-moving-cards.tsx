import React, { useEffect, useState, useCallback, memo } from "react";
import Image from "next/image";

export const InfiniteMovingCards = memo(function InfiniteMovingCards({
  items,
  direction = "left",
  speed = "slow",
  pauseOnHover = false,
  className,
}: {
  items: {
    image: string;
    name?: string;
    title?: string;
  }[];
  direction?: "left" | "right";
  speed?: "fast" | "normal" | "slow";
  pauseOnHover?: boolean;
  className?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLUListElement>(null);
  const [start, setStart] = useState(false);

  const getDirection = useCallback(() => {
    containerRef.current?.style.setProperty(
      "--animation-direction",
      direction === "left" ? "forwards" : "reverse"
    );
  }, [direction]);

  const getSpeed = useCallback(() => {
    let duration = "40s"; // Default to "normal"
    if (speed === "fast") {
      duration = "20s";
    } else if (speed === "slow") {
      duration = "100s";
    }
    containerRef.current?.style.setProperty("--animation-duration", duration);
  }, [speed]);

  const addAnimation = useCallback(() => {
    if (containerRef.current && scrollerRef.current) {
      const scrollerContent = Array.from(scrollerRef.current.children);

      scrollerContent.forEach((item) => {
        const duplicatedItem = item.cloneNode(true);
        scrollerRef.current?.appendChild(duplicatedItem);
      });

      getDirection();
      getSpeed();
      setStart(true);
    }
  }, [getDirection, getSpeed]);

  useEffect(() => {
    addAnimation();
  }, [addAnimation]);

  return (
    <div
      ref={containerRef}
      className={`scroller relative w-screen overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_20%,white_80%,transparent)] ${className}`}
    >
      <ul
        ref={scrollerRef}
        className={`flex min-w-full shrink-0 gap-4 py-4 w-max flex-nowrap ${
          start ? "animate-scroll" : ""
        } ${pauseOnHover ? "hover:[animation-play-state:paused]" : ""}`}
      >
        {items.map((item, idx) => (
          <li
            key={idx}
            className="w-[200px] h-[300px] sm:w-[450px] sm:h-[450px] flex items-center justify-center max-w-full relative rounded-2xl flex-shrink-0"
          >
            <Image
              src={item.image}
              alt={item.name || item.title || `Item ${idx}`}
              className="w-full h-full object-cover rounded-2xl"
              width={450}
              height={450}
              loading="lazy"
            />
          </li>
        ))}
      </ul>
    </div>
  );
});
