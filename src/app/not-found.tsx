import Link from "next/link";
export default function NotFound() {
  return (
    <main className="setup-page">
      <div className="panel empty-panel">
        <h1>Страница не найдена</h1>
        <Link href="/" className="button primary">
          На главную
        </Link>
      </div>
    </main>
  );
}
