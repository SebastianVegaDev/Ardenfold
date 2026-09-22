import * as React from "react";

import { cn } from "./lib/cn";

export const Input = React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
    <input
        className={cn(
            "flex h-10 w-full rounded-control border border-input bg-surface px-3 py-2 text-sm text-foreground transition-colors duration-fast outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
            className,
        )}
        ref={ref}
        type={type}
        {...props}
    />
));

Input.displayName = "Input";
