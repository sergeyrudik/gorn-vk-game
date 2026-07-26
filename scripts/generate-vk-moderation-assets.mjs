import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "moderation", "assets");
await mkdir(output, { recursive: true });

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="70%">
      <stop offset="0" stop-color="#ffba08"/>
      <stop offset=".45" stop-color="#e85d04"/>
      <stop offset="1" stop-color="#1a1410"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="#1a1410"/>
  <circle cx="512" cy="512" r="360" fill="url(#g)"/>
  <text x="512" y="580" text-anchor="middle" fill="#f3efe8" font-family="Georgia, serif" font-size="280" font-weight="700">Г</text>
</svg>`;

const iconBase = sharp(Buffer.from(iconSvg));
for (const [filename, size] of [
  ["icon-universal-576.png", 576],
  ["icon-catalog-278.png", 278],
  ["icon-small-150.png", 150],
  ["favicon-32.png", 32],
]) {
  await iconBase.clone().resize(size, size).png({ compressionLevel: 9 }).toFile(resolve(output, filename));
}

const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a2418"/>
      <stop offset="1" stop-color="#1a1410"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="260" cy="300" r="150" fill="#e85d04"/>
  <circle cx="260" cy="300" r="70" fill="#ffba08"/>
  <text x="480" y="280" fill="#ffba08" font-family="Georgia, serif" font-size="96" font-weight="700">Горн</text>
  <text x="480" y="360" fill="#f3efe8" font-family="Trebuchet MS, sans-serif" font-size="36" font-weight="700">Кузница — вкуй удачу!</text>
</svg>`;

await sharp(Buffer.from(ogSvg)).png({ compressionLevel: 9 }).toFile(resolve(root, "public", "og.png"));
await sharp(Buffer.from(ogSvg)).resize(1120, 630, { fit: "cover" }).png().toFile(resolve(output, "big-snippet-1120x630.png"));

const shots = {
  start: { title: "Горн", subtitle: "Кузница — вкуй удачу!" },
  campaign: { title: "Наковальня", subtitle: "Удары, криты и автодоход" },
  camp: { title: "Цех", subtitle: "Молот, меха, подмастерья" },
  quests: { title: "Задания", subtitle: "Ежедневная ковка" },
};

for (const [name, copy] of Object.entries(shots)) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="1200" viewBox="0 0 600 1200">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a2418"/>
        <stop offset="1" stop-color="#1a1410"/>
      </linearGradient>
    </defs>
    <rect width="600" height="1200" fill="url(#bg)"/>
    <circle cx="300" cy="180" r="90" fill="#e85d04"/>
    <circle cx="300" cy="180" r="42" fill="#ffba08"/>
    <rect x="40" y="300" width="520" height="700" rx="32" fill="#f3efe8" stroke="#8b5a2b" stroke-width="6"/>
    <text x="300" y="420" text-anchor="middle" fill="#1a1410" font-family="Georgia, serif" font-size="56" font-weight="700">${copy.title}</text>
    <text x="300" y="480" text-anchor="middle" fill="#e85d04" font-family="Trebuchet MS, sans-serif" font-size="24" font-weight="700">${copy.subtitle}</text>
    <text x="300" y="540" text-anchor="middle" fill="#5a6d5f" font-family="Trebuchet MS, sans-serif" font-size="18">Горн — кузница</text>
    <rect x="90" y="600" width="420" height="280" rx="24" fill="#2a1c16" stroke="#e85d04" stroke-width="3"/>
    <text x="300" y="700" text-anchor="middle" fill="#ffba08" font-family="Trebuchet MS, sans-serif" font-size="22" font-weight="700">Удары · криты · крафт</text>
    <text x="300" y="750" text-anchor="middle" fill="#f3efe8" font-family="Trebuchet MS, sans-serif" font-size="20">Цех · рецепты · задания</text>
    <text x="300" y="820" text-anchor="middle" fill="#9a8a7a" font-family="Trebuchet MS, sans-serif" font-size="16">VK Mini App · 600×1200</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(resolve(output, `screenshot-${name}-600x1200.jpg`));
}

await writeFile(
  resolve(root, "moderation", "texts.txt"),
  `НАЗВАНИЕ
Горн — кузница

ОПИСАНИЕ
«Горн — кузница» — казуальный idle-кликер для VK Mini Apps. Игрок бьёт по наковальне, копится слитки, нанимает подмастерьев, открывает рецепты оружия и выполняет ежедневные задания. Есть офлайн-доход, улучшения и награды за рекламу. Прогресс сохраняется локально и в VK Storage.

КРАТКОЕ ОПИСАНИЕ
Бей по наковальне, копи слитки и куй легендарное оружие.

СЛОГАН
Вкуй удачу!

КАТЕГОРИЯ
Игры → Казуальные

ВОЗРАСТНОЕ ОГРАНИЧЕНИЕ
6+

КОММЕНТАРИЙ МОДЕРАТОРУ
Игра не требует специальных прав. Обучение: удар по наковальне, улучшение в цехе или крафт рецепта. Rewarded-реклама только по инициативе пользователя.

Проверка:
1. Нажать «К горну».
2. Ударить по наковальне несколько раз.
3. Открыть «Цех», «Рецепты», «Задания», «Итоги».
`,
);

console.log(`VK moderation assets generated in ${output}`);
