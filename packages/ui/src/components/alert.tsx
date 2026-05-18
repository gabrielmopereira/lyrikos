import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 border px-4 py-3.5 text-sm leading-relaxed has-[>svg]:grid-cols-[16px_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    defaultVariants: { variant: "default" },
    variants: {
      variant: {
        default:
          "rounded-(--radius) border-glass-border bg-card text-card-foreground *:data-[slot=alert-description]:text-muted-foreground",
        destructive:
          "rounded-(--radius) border-destructive/30 bg-destructive/12 text-destructive *:data-[slot=alert-description]:text-destructive/88 [&>svg]:text-current",
        note: "rounded-r-tile border-0 border-l-2 border-l-secondary bg-secondary/6 px-4 py-3 text-marble-dim *:data-[slot=alert-description]:text-foreground/80 *:data-[slot=alert-title]:font-mono *:data-[slot=alert-title]:text-[9.5px] *:data-[slot=alert-title]:font-medium *:data-[slot=alert-title]:tracking-[0.14em] *:data-[slot=alert-title]:text-secondary *:data-[slot=alert-title]:uppercase [&>svg]:text-secondary",
      },
    },
  },
);

const Alert = ({
  className,
  tone,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants> & { tone?: "warning" }) => (
  <div
    className={cn(alertVariants({ variant }), className)}
    data-slot="alert"
    data-tone={tone}
    role="alert"
    {...props}
  />
);

const AlertTitle = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn("col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight", className)}
    data-slot="alert-title"
    {...props}
  />
);

const AlertDescription = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn(
      "col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed",
      className,
    )}
    data-slot="alert-description"
    {...props}
  />
);

export { Alert, AlertTitle, AlertDescription };
