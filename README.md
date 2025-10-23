# Как это билдить?

## Требования

- Node.js ≥ 18.x
- npm ≥ 9.x

Проверить версии:

```bash
node -v
npm -v
```

## Установка

```bash
git clone -b frontend https://github.com/kostyakaa/ITS.git
cd ITS
npm install
```

## Запуск dev-версии

```bash
npm run dev
```

По умолчанию: http://localhost:5173

## Сборка продакшна

```bash
npm run build
```

Сборка появится в папке `dist/`.

## Предпросмотр билда

```bash
npm run preview
```

Обычно доступен по адресу http://localhost:4173

# Как работать с API симулятора?

## Пример кода для инициализации объектов

```bash
API.init({
  lights: [
    { id: "tl-1", x: -7.5, y: 10.5, z: 0.25, rot: Math.PI / 2, color: "red" },
  ],
  cars: [
    { id: "car-69", x: 0, y: 0, z: 0, rot: Math.PI },
  ]
});
```
- Угол объекта задается в радианах
- Доступные цвета светофора: ["red", "yellow", "green"]

## Пример кода для изменения состояний объектов

```bash
API.moveCar('car-1', { x: 4, y: 2, rot: Math.PI / 3 }); // градусы числом — тоже ок
API.setTrafficLightColor('tl-1', 'red');
```
- Угол и координаты задаётся в абсолютных значениях
- Точка [0, 0, 0] - находится по центру дороги