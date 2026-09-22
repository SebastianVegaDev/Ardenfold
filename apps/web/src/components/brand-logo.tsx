type BrandLogoProps = Readonly<{
    alt: string;
    className?: string;
}>;

export function BrandLogo({ alt, className }: BrandLogoProps) {
    return (
        <picture>
            <source media="(prefers-color-scheme: dark)" srcSet="/brand/logo-primary-dark.svg" />
            <img
                alt={alt}
                className={className}
                height="180"
                src="/brand/logo-primary-light.svg"
                width="720"
            />
        </picture>
    );
}
