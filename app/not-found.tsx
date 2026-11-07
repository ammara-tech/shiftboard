import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-3xl font-extrabold">That page isn&apos;t on the rota</h1>
      <p className="mt-3 text-ink-soft">The address may be mistyped, or the page has moved.</p>
      <Link href="/" className="btn mt-8">
        Back to the rota
      </Link>
    </div>
  );
}
