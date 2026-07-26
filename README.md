# Горн — кузница

Казуальный idle-кликер для VK Mini Apps. Бей по наковальне, копи слитки,
нанимай подмастерьев и куй оружие.

- VK Mini App: _создайте приложение в кабинете VK_
- production: _URL Timeweb после деплоя_
- репозиторий: [sergeyrudik/gorn-vk-game](https://github.com/sergeyrudik/gorn-vk-game)

## Запуск

```bash
pnpm install
pnpm run dev
```

```bash
pnpm run test:all
pnpm run timeweb:build
pnpm start
```

## Timeweb

| Поле | Значение |
| --- | --- |
| Репозиторий | `sergeyrudik/gorn-vk-game` |
| Ветка | `main` |
| Node.js | 22 |
| Сборка | `pnpm run timeweb:build` |
| Директория | `out` |
| Запуск | `pnpm run timeweb:start` |
