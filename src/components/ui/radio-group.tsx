import * as React from "react"
import { cn } from "@/lib/utils"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid w-full gap-2", className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        // Radix drives the checked state through `data-state="checked"`, NOT a
        // `data-checked` attribute — verified in
        // @radix-ui/react-radio-group/dist/index.mjs (`"data-state": getState(checked)`).
        // The shadcn generator emitted `data-checked:` variants, which target
        // `[data-checked]` in Tailwind 4 and therefore never matched: the control
        // looked identical checked or not, and its black indicator dot sat on a
        // near-black background. Target the attribute Radix actually writes.
        "peer relative flex aspect-square size-4 shrink-0 rounded-full border border-input bg-input/30 outline-none",
        // Widen the hit target beyond the 16px circle without moving it.
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
