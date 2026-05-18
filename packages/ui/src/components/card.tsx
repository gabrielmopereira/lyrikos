import { cva } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "../lib/utils";

const cardVariants = cva(
  "relative flex flex-col bg-clip-padding text-card-foreground transition-[background-color,border-color,box-shadow] duration-200 ease-out",
  {
    defaultVariants: { size: "md", tone: "darkGlass" },
    variants: {
      size: {
        lg: "rounded-[calc(var(--radius-card)+4px)]",
        md: "rounded-card",
        sm: "rounded-[18px]",
        xs: "rounded-2xl",
      },
      tone: {
        darkGlass:
          "border border-glass-border bg-[color-mix(in_oklab,var(--background)_55%,transparent)] shadow-[0_24px_60px_-20px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.08)] backdrop-blur-2xl backdrop-saturate-[1.3]",
        ghost: "border border-marble-faint bg-transparent shadow-none",
        glass:
          "border border-glass-border bg-[color-mix(in_oklab,var(--glass-strong)_55%,transparent)] shadow-[0_24px_60px_-20px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.08)] backdrop-blur-2xl backdrop-saturate-[1.3]",
        muted: "border border-glass-border bg-card shadow-sm",
      },
    },
  },
);

type CardProps = ComponentProps<"div"> & {
  size?: "xs" | "sm" | "md" | "lg";
  tone?: "darkGlass" | "ghost" | "glass" | "muted";
};

const Card = ({ className, size, tone, ...props }: CardProps) => (
  <div className={cn(cardVariants({ className, size, tone }))} data-slot="card" {...props} />
);

const CardHeader = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "grid-rows-[auto, auto] @container/card-header grid auto-rows-min items-baseline gap-x-4 gap-y-1 px-8 pt-5 pb-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] data-divider:border-b data-divider:border-marble-faint",
      className,
    )}
    data-slot="card-header"
    {...props}
  />
);

const CardTitle = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "font-serif text-2xl leading-tight font-medium tracking-tight text-foreground",
      className,
    )}
    data-slot="card-title"
    {...props}
  />
);

const CardDescription = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn("font-mono text-xs tracking-widest text-marble-dim uppercase", className)}
    data-slot="card-description"
    {...props}
  />
);

const CardAction = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn("col-start-2 row-span-2 row-start-1 self-center justify-self-end", className)}
    data-slot="card-action"
    {...props}
  />
);

const CardContent = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "px-7 pb-5 data-flush:px-0 data-flush:pb-0 data-scroll:min-h-0 data-scroll:flex-1 data-scroll:overflow-y-scroll",
      className,
    )}
    data-slot="card-content"
    {...props}
  />
);

const CardFooter = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "flex items-center justify-between gap-4 px-7 py-3 data-divider:border-t data-divider:border-marble-faint data-divider:pt-3 data-[tone=muted]:bg-[rgb(0_0_0/0.18)]",
      className,
    )}
    data-slot="card-footer"
    {...props}
  />
);

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  cardVariants,
};
