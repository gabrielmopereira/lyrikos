"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const Tabs = ({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) => (
  <TabsPrimitive.Root
    className={cn("group/tabs flex gap-3.5 data-horizontal:flex-col", className)}
    data-orientation={orientation}
    data-slot="tabs"
    {...props}
  />
);

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center text-marble-dim group-data-vertical/tabs:flex-col group-data-vertical/tabs:items-stretch",
  {
    defaultVariants: { size: "default", variant: "default" },
    variants: {
      size: {
        default:
          "**:data-[slot=tabs-trigger]:h-7.5 **:data-[slot=tabs-trigger]:px-3.5 **:data-[slot=tabs-trigger]:text-[12.5px]",
        lg: "**:data-[slot=tabs-trigger]:h-9 **:data-[slot=tabs-trigger]:px-4.5 **:data-[slot=tabs-trigger]:text-[13.5px]",
        sm: "**:data-[slot=tabs-trigger]:h-6.5 **:data-[slot=tabs-trigger]:px-3 **:data-[slot=tabs-trigger]:text-[11.5px]",
      },
      variant: {
        default: "gap-0.5 rounded-full border border-glass-border bg-glass p-0.75 backdrop-blur-md",
        line: "w-full justify-start gap-1 rounded-none border-b border-marble-faint group-data-vertical/tabs:w-fit group-data-vertical/tabs:border-r group-data-vertical/tabs:border-b-0",
      },
    },
  },
);

const TabsList = ({
  className,
  size = "default",
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) => (
  <TabsPrimitive.List
    className={cn(tabsListVariants({ size, variant }), className)}
    data-slot="tabs-list"
    data-variant={variant}
    {...props}
  />
);

const TabsTrigger = ({ className, ...props }: TabsPrimitive.Tab.Props) => (
  <TabsPrimitive.Tab
    className={cn(
      "relative inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 border border-transparent bg-clip-padding font-medium tracking-[0.01em] whitespace-nowrap text-marble-dim transition-[background-color,border-color,color] duration-150 ease-out outline-none select-none group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-3.5",
      // default variant — ghost chip, lifts to marble/14% on active
      "group-data-[variant=default]/tabs-list:rounded-full group-data-[variant=default]/tabs-list:hover:bg-glass-strong group-data-[variant=default]/tabs-list:data-active:border-foreground/18 group-data-[variant=default]/tabs-list:data-active:bg-foreground/14 group-data-[variant=default]/tabs-list:data-active:text-foreground",
      // line variant — underline (or right-edge bar) in --primary on active
      "group-data-[variant=line]/tabs-list:mr-3.5 group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:px-1 after:absolute after:bg-primary after:opacity-0 after:transition-opacity group-data-[variant=line]/tabs-list:group-data-horizontal/tabs:after:inset-x-0 group-data-[variant=line]/tabs-list:group-data-horizontal/tabs:after:-bottom-px group-data-[variant=line]/tabs-list:group-data-horizontal/tabs:after:h-[1.5px] group-data-[variant=line]/tabs-list:group-data-vertical/tabs:after:inset-y-0 group-data-[variant=line]/tabs-list:group-data-vertical/tabs:after:-right-px group-data-[variant=line]/tabs-list:group-data-vertical/tabs:after:w-[1.5px] group-data-[variant=line]/tabs-list:data-active:text-foreground group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
      className,
    )}
    data-slot="tabs-trigger"
    {...props}
  />
);

const TabsContent = ({ className, ...props }: TabsPrimitive.Panel.Props) => (
  <TabsPrimitive.Panel
    className={cn("flex-1 text-sm text-foreground/85 outline-none", className)}
    data-slot="tabs-content"
    {...props}
  />
);

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
