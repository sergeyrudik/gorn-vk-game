import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Пользовательское соглашение — Горн",
  description: "Условия использования игры «Горн — кузница».",
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <Link className="legal-back" href="/">← Вернуться в игру</Link>
        <p className="legal-kicker">Горн — кузница</p>
        <h1>Пользовательское соглашение</h1>
        <p className="legal-updated">Редакция от 26 июля 2026 года</p>
        <section>
          <h2>1. Принятие</h2>
          <p>Запуская «Горн — кузница», пользователь принимает условия и правила ВКонтакте.</p>
        </section>
        <section>
          <h2>2. Виртуальные ценности</h2>
          <p>Слитки, уголь, улучшения и рецепты — виртуальные элементы Игры без обмена на деньги.</p>
        </section>
        <section>
          <h2>3. Реклама</h2>
          <p>Rewarded-реклама только по действию пользователя; награда после подтверждённого просмотра.</p>
        </section>
        <footer className="legal-footer">
          <Link href="/privacy/">Политика конфиденциальности</Link>
        </footer>
      </article>
    </main>
  );
}
