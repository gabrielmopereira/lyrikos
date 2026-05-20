"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import * as React from "react";

import { cn } from "../lib/utils";

const Popover = ({ ...props }: PopoverPrimitive.Root.Props) => (
  <PopoverPrimitive.Root data-slot="popover" {...props} />
);

const PopoverTrigger = ({ ...props }: PopoverPrimitive.Trigger.Props) => (
  <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
);

type PopoverContentProps = PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">;

const PopoverContent = ({
  align = "center",
  alignOffset = 0,
  className,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverContentProps) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Positioner
      align={align}
      alignOffset={alignOffset}
      className="isolate z-50"
      side={side}
      sideOffset={sideOffset}
    >
      <PopoverPrimitive.Popup
        className={cn(
          "z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        data-slot="popover-content"
        {...props}
      />
    </PopoverPrimitive.Positioner>
  </PopoverPrimitive.Portal>
);

const PopoverHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn("flex flex-col gap-0.5 text-sm", className)}
    data-slot="popover-header"
    {...props}
  />
);

const PopoverTitle = ({ className, ...props }: PopoverPrimitive.Title.Props) => (
  <PopoverPrimitive.Title
    className={cn("font-medium", className)}
    data-slot="popover-title"
    {...props}
  />
);

const PopoverDescription = ({ className, ...props }: PopoverPrimitive.Description.Props) => (
  <PopoverPrimitive.Description
    className={cn("text-muted-foreground", className)}
    data-slot="popover-description"
    {...props}
  />
);

export { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger };
