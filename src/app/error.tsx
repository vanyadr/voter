"use client";
import { Brand } from "@/components/brand";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="setup-page">
      <Brand />
      <section className="panel empty-panel">
        <h1>Не удалось загрузить страницу</h1>
        <p>
          Проверьте соединение и попробуйте ещё раз. Уже отправленные оценки
          сохранены в базе данных.
        </p>
        <button className="button primary" onClick={reset}>
          Попробовать снова
        </button>
        <a href="/" className="text-link">
          На главную
        </a>
      </section>
    </main>
  );
}
