import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap prose">
      <h1>Not found</h1>
      <p>That page does not exist — it may have been renamed, or the link may be wrong.</p>
      <p><Link href="/#guides">Back to the guides</Link></p>
    </div>
  );
}
