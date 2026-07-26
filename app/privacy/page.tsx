import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — Горн",
  description: "Политика обработки данных в игре «Горн — кузница».",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <Link className="legal-back" href="/">← Вернуться в игру</Link>
        <p className="legal-kicker">Горн — кузница</p>
        <h1>Политика конфиденциальности</h1>
        <p className="legal-updated">Редакция от 26 июля 2026 года</p>
        <section>
          <h2>1. Общие положения</h2>
          <p>
            Эта политика описывает обработку данных в мини-приложении «Горн — кузница»
            (далее — «Игра»). Оператор — разработчик на странице приложения ВКонтакте.
          </p>
        </section>
        <section>
          <h2>2. Данные</h2>
          <ul>
            <li>профиль ВКонтакте через VK Bridge;</li>
            <li>прогресс: слитки, уголь, улучшения, рецепты, задания;</li>
            <li>события игры и результат рекламы.</li>
          </ul>
        </section>
        <section>
          <h2>3. Хранение</h2>
          <p>Прогресс хранится в localStorage и VK Storage. Данные профиля не продаются.</p>
        </section>
        <footer className="legal-footer">
          <Link href="/terms/">Пользовательское соглашение</Link>
        </footer>
      </article>
    </main>
  );
}
