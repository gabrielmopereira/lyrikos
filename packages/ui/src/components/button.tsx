import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-transparent bg-clip-padding font-medium tracking-[0.02em] whitespace-nowrap backdrop-blur-md transition-[background-color,border-color,color,transform] duration-150 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-3.5",
  {
    defaultVariants: { size: "default", variant: "chip" },
    variants: {
      size: {
        default: "h-8 px-3.5 text-sm",
        icon: "size-8",
        "icon-lg": "size-9",
        "icon-sm": "size-7",
        "icon-xl": "size-10",
        "icon-xs": "size-6",
        lg: "h-9 px-4 text-sm",
        sm: "h-7 gap-1.5 px-3 text-xs",
        xl: "h-10 px-4.5 text-sm",
        xs: "h-6 gap-1.5 px-2.5 text-xs [&_svg:not([class*=size-])]:size-3",
      },
      variant: {
        chip: "border-glass-border bg-glass-strong text-foreground hover:border-foreground/20 hover:bg-foreground/14 aria-expanded:border-foreground/22 aria-expanded:bg-foreground/16 data-[state=on]:bg-foreground/16",
        destructive:
          "border-destructive/30 bg-destructive/14 text-destructive hover:bg-destructive/22 focus-visible:ring-destructive/30",
        ghost:
          "border-transparent bg-transparent text-marble-dim backdrop-blur-none hover:bg-glass-strong hover:text-foreground aria-expanded:bg-glass-strong aria-expanded:text-foreground data-[state=on]:bg-glass-strong data-[state=on]:text-foreground",
        link: "h-auto border-transparent bg-transparent p-0 text-primary underline-offset-4 backdrop-blur-none hover:underline",
        outline:
          "border-glass-border bg-glass text-foreground hover:border-foreground/20 hover:bg-glass-strong",
        primary:
          "border-transparent bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] hover:bg-primary/90",
        secondary:
          "border-secondary/30 bg-secondary/15 text-secondary hover:border-secondary/40 hover:bg-secondary/25",
      },
    },
  },
);

const Button = ({
  className,
  size = "default",
  variant = "chip",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) => (
  <ButtonPrimitive
    className={cn(buttonVariants({ className, size, variant }))}
    data-slot="button"
    {...props}
  />
);

export { Button, buttonVariants };
