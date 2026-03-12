import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bb-black flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-2">
          <h1 className="text-6xl font-display font-bold text-bb-orange">404</h1>
          <h2 className="text-xl font-display font-semibold text-white">
            Page Not Found
          </h2>
          <p className="text-sm text-bb-muted">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-bb-orange hover:bg-bb-orange/90 text-white font-medium rounded-lg transition-colors text-sm"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
