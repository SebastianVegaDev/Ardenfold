export default function ImportsLoading() {
    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8" aria-busy="true">
            <div className="bg-muted h-10 w-64 animate-pulse rounded-control" />
            <div className="bg-muted h-48 animate-pulse rounded-card" />
        </div>
    );
}
