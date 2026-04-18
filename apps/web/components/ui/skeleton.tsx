import * as React from "react";
import { cn } from "../../lib/utils";

/** Shimmering placeholder block. Use for loading states. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/60",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
        "before:[background-size:200%_100%]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
