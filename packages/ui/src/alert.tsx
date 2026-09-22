import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "./lib/cn";

const alertVariants = cva(
    "relative w-full rounded-card border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7",
    {
        variants: {
            variant: {
                default: "border-border bg-surface text-foreground",
                info: "border-info/30 bg-info-subtle text-info-strong",
                success: "border-success/30 bg-success-subtle text-success-strong",
                warning: "border-warning/30 bg-warning-subtle text-warning-strong",
                destructive: "border-destructive/30 bg-destructive-subtle text-destructive-strong",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
);

export interface AlertProps
    extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
    ({ className, variant, ...props }, ref) => (
        <div
            className={cn(alertVariants({ variant }), className)}
            ref={ref}
            role="alert"
            {...props}
        />
    ),
);
Alert.displayName = "Alert";

export const AlertTitle = React.forwardRef<
    HTMLHeadingElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h5 className={cn("mb-1 leading-none font-medium", className)} ref={ref} {...props} />
));
AlertTitle.displayName = "AlertTitle";

export const AlertDescription = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div className={cn("text-sm [&_p]:leading-relaxed", className)} ref={ref} {...props} />
));
AlertDescription.displayName = "AlertDescription";
