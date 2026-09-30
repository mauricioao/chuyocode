import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { SpinnerGapIcon } from "@phosphor-icons/react/dist/ssr/SpinnerGap"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-default disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      // `press` is its own axis (not folded into `variant`) so ANY variant —
      // outline, ghost, whatever an arrow control uses — can opt out of the
      // press affordance. "none" is a hard removal of the utility from the
      // class string, not a later override.
      //
      // Uses `scale-*`, not `translate-y-*`: Tailwind 4 animates `scale`
      // through the standalone CSS `scale` property (not the `transform`
      // shorthand), so it composes with a caller's own positioning
      // transform (e.g. a `-translate-y-1/2` vertical-center trick) instead
      // of silently replacing it on `:active` — which is what the OLD
      // `translate-y-px` press did, and why the carousel arrow controls
      // (`carousel.tsx`'s CarouselPrevious/CarouselNext) still opt out via
      // `press="none"` — see `button.test.tsx` and `carousel.test.tsx`.
      press: {
        default: "active:not-aria-[haspopup]:scale-[0.98]",
        none: "",
      },
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        primary: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "border-border bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      press: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  press = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Shows a spinner and sets `aria-busy`; keeps the button's own width
     * stable by hiding (not removing) its label rather than swapping it. */
    loading?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"
  // `asChild` hands control of the rendered element to Radix `Slot`, which
  // requires exactly one child element — adding a spinner sibling would
  // break that contract, so the loading visual only applies to a real
  // <button>. `aria-busy`/`data-loading` still land on the Comp either way.
  const showSpinner = loading && !asChild

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={asChild ? undefined : disabled || loading}
      aria-disabled={asChild ? disabled || loading || undefined : undefined}
      className={cn(buttonVariants({ variant, size, press, className }))}
      {...props}
    >
      {showSpinner ? (
        <>
          <span className="absolute inset-0 flex items-center justify-center">
            <SpinnerGapIcon className="size-4 animate-spin" aria-hidden="true" />
          </span>
          <span className="invisible inline-flex items-center gap-1.5">
            {children}
          </span>
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
