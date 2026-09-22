import { LoaderCircle } from "lucide-react";

import { cn } from "./lib/cn";

export type SpinnerProps = Readonly<{
    label: string;
    className?: string;
}>;

export function Spinner({ className, label }: SpinnerProps) {
    return (
        <span aria-label={label} className="inline-flex items-center" role="status">
            <LoaderCircle aria-hidden="true" className={cn("size-5 animate-spin", className)} />
            <span className="sr-only">{label}</span>
        </span>
    );
}
