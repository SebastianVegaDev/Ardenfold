export default function AssetsLoading() {
    return (
        <div className="mx-auto max-w-6xl animate-pulse space-y-6 p-6 sm:p-8" aria-busy="true">
            <div className="h-9 w-48 rounded-control bg-surface-muted" />
            <div className="h-28 rounded-card bg-surface-muted" />
            <div className="h-64 rounded-card bg-surface-muted" />
        </div>
    );
}
