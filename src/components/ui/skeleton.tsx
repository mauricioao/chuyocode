import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // `motion-reduce:animate-none` — a reduced-motion preference turns the
      // pulse into a plain static fill rather than disabling it with nothing
      // to replace it (coherent loading states, item 2: "gentle pulse,
      // reduced-motion -> static").
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
