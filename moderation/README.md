# Пакет модерации VK — Горн

Приложение: `app54694462`

Скриншоты **600×1200** JPG (вертикальная ориентация) в `moderation/assets/`.

```bash
pnpm run moderation:assets
pnpm run moderation:validate
```

## URL

- Web / Mobile: `https://sergeyrudik-gorn-vk-game-3385.twc1.net/`
- Privacy: `https://sergeyrudik-gorn-vk-game-3385.twc1.net/privacy/`
- Terms: `https://sergeyrudik-gorn-vk-game-3385.twc1.net/terms/`

## Реальные скриншоты

`moderation:assets` обновляет иконки, сниппет и тексты, сохраняя существующие скриншоты. Скриншоты снимаются отдельно с финального игрового интерфейса в мобильном размере 600×1200 и сохраняются в `moderation/assets/`. Промокарточки не заменяют снимки игры.

Проектная проверка `moderation:validate` ожидает четыре JPG:
- `screenshot-start-600x1200.jpg`
- `screenshot-campaign-600x1200.jpg`
- `screenshot-camp-600x1200.jpg`
- `screenshot-quests-600x1200.jpg`

После замены снимков выполните `moderation:validate`.
