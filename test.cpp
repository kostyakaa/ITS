#include <SFML/Graphics.hpp>
#include <iostream>
#include <vector>
#include <memory>
#include "./core/models/road_network.h"
#include "./core/models/signals.h"
#include "core/models/routing.h"
#include "core/models/vehicle.h"
#include "core/models/world_context.h"
#include "core/simulation/simulation.h"

class RoadNetworkVisualizer {
private:
    sim::Simulation simulation_;
    sf::RenderWindow window_;
    sf::Font font;
    float scale_;
    sf::Vector2f offset_;
    float last_spawn = 0;

public:
    RoadNetworkVisualizer()
        : window_(sf::VideoMode(2000, 1400),
                  "Road Network - 4-Way Intersection"),
          scale_(5.0f), offset_(-500.00, -50.00) {
        simulation_.initRoadNetwork();
        sim::DriverProfile dp;
        sim::VehicleParams vp;
        // simulation_.addVehicle(vp, dp, 10, sim::Goal::toLane(7), 10);
        // simulation_.addVehicle(vp, dp, 4, sim::Goal::toLane(7), 10);
        // simulation_.addVehicle(vp, dp, 12, sim::Goal::toLane(7), 10);
        // simulation_.addVehicle(vp, dp, 2, sim::Goal::toLane(7), 0);
        // simulation_.addVehicle(vp, dp, 10, sim::Goal::toLane(7), 0);
        // simulation_.addVehicle(vp, dp, 4, sim::Goal::toLane(7), 0);
        // simulation_.addVehicle(vp, dp, 12, sim::Goal::toLane(7), 0);
        // simulation_.addVehicle(vp, dp, 2, sim::Goal::toLane(7), 15);
        // // simulation_.addVehicle(vp, dp, 10, sim::Goal::toLane(7), 15);
        // simulation_.addVehicle(vp, dp, 4, sim::Goal::toLane(7), 15);
        // simulation_.addVehicle(vp, dp, 12, sim::Goal::toLane(7), 15);
        // simulation_.addVehicle(vp, dp, 2, sim::Goal::toLane(7), 5);
        // simulation_.addVehicle(vp, dp, 10, sim::Goal::toLane(7), 5);
        // // simulation_.addVehicle(vp, dp, 4, sim::Goal::toLane(7), 5);
        // simulation_.addVehicle(vp, dp, 12, sim::Goal::toLane(7), 5);
        //
        // // simulation_.addVehicle(vp, dp, 8, sim::Goal::toLane(13), 10);
        // // simulation_.addVehicle(vp, dp, 6, sim::Goal::toLane(13), 10);
        // simulation_.addVehicle(vp, dp, 8, sim::Goal::toLane(15), 15);
        // simulation_.addVehicle(vp, dp, 6, sim::Goal::toLane(15), 15);
        // // simulation_.addVehicle(vp, dp, 8, sim::Goal::toLane(15), 0);
        // simulation_.addVehicle(vp, dp, 6, sim::Goal::toLane(13), 0);
        // // simulation_.addVehicle(vp, dp, 8, sim::Goal::toLane(13), 5);
        // simulation_.addVehicle(vp, dp, 6, sim::Goal::toLane(13), 5);
    }


    void run() {
        sf::Clock frameClock;
        while (window_.isOpen()) {
            handleEvents();
            double dt = frameClock.restart().asSeconds();

            simulation_.update(0.02);
            if (abs(simulation_.time() - last_spawn) > 3) {
                simulation_.addRandomVehicle();
                last_spawn = simulation_.time();
            }

            // std::cout << (simulation_.world().carSignalForLane(2) ==
            // sim::CarSignal::Red) << " " << (simulation_.world().carSignalForLane(8) ==
            // sim::CarSignal::Red) << "\n";

            render();
        }
    }

private:
    void drawVehicle(sim::Vehicle* car) {
        // Получаем позицию и ориентацию машины
        sim::Pose pose = car->pose();
        sf::Vector2f screenPos = worldToScreen(sim::Vec2(pose.x, pose.y));

        // Размеры машины в мировых координатах (в метрах)
        float worldLength = 4.4f; // 4 метра длина
        float worldWidth = 1.8f; // 2 метра ширина

        // Конвертируем в экранные координаты с учетом масштаба
        float screenLength = worldLength * scale_;
        float screenWidth = worldWidth * scale_;

        // Ограничим минимальный размер, чтобы машина не исчезала при сильном уменьшении
        screenLength = std::max(screenLength, 5.0f);
        screenWidth = std::max(screenWidth, 2.5f);

        // Рисуем машину как прямоугольник
        sf::RectangleShape carShape(sf::Vector2f(screenLength, screenWidth));
        carShape.setFillColor(sf::Color::Red);
        carShape.setOrigin(screenLength / 2.0f, screenWidth / 2.0f);
        // центр прямоугольника
        carShape.setPosition(screenPos);
        carShape.setRotation(-pose.theta * 180.0f / M_PI);

        window_.draw(carShape);

        // Маркер направления тоже масштабируем
        float markerRadius = 1.f * scale_;
        markerRadius = std::max(markerRadius, 2.0f); // минимальный размер

        sf::CircleShape directionMarker(markerRadius);
        directionMarker.setFillColor(sf::Color::White);
        directionMarker.setOrigin(markerRadius, markerRadius);

        // Позиция маркера относительно машины (в мировых координатах)
        float markerOffset = worldLength * 0.3f; // 30% от длины машины
        sf::Vector2f markerWorldOffset(
            markerOffset * cos(pose.theta),
            -markerOffset * sin(pose.theta) // минус из-за инвертированной Y-оси
            );

        directionMarker.setPosition(
            screenPos.x + markerWorldOffset.x * scale_,
            screenPos.y + markerWorldOffset.y * scale_
            );

        window_.draw(directionMarker);

        // Отрисовка ID автомобиля
        sf::Text idText;
        // Предполагаем, что у вас есть шрифт, загруженный в font_
        idText.setFont(font);
        idText.setString(std::to_string(car->id()));
        // Предполагаем, что есть метод getId()
        idText.setCharacterSize(12); // Размер шрифта
        idText.setFillColor(sf::Color::Blue);

        // Центрируем текст над машиной
        sf::FloatRect textBounds = idText.getLocalBounds();
        idText.setOrigin(textBounds.width / 2.0f, textBounds.height / 2.0f);

        // Позиция текста - над машиной
        float textOffset = worldLength * 0.6f;
        // Смещение текста относительно центра машины
        sf::Vector2f textWorldOffset(
            -textOffset * sin(pose.theta),
            // Перпендикулярно направлению движения
            -textOffset * cos(pose.theta)
            // Перпендикулярно направлению движения
            );

        idText.setPosition(
            screenPos.x + textWorldOffset.x * scale_,
            screenPos.y + textWorldOffset.y * scale_
            );

        window_.draw(idText);
    }

    void handleEvents() {
        sf::Event event;
        while (window_.pollEvent(event)) {
            if (event.type == sf::Event::Closed)
                window_.close();
            else if (event.type == sf::Event::MouseWheelScrolled) {
                // Масштабирование колесиком мыши
                if (event.mouseWheelScroll.delta > 0)
                    scale_ *= 1.1f;
                else
                    scale_ *= 0.9f;
            }
        }
    }

    void render() {
        window_.clear(sf::Color(240, 240, 240)); // Светло-серый фон

        drawLanes();
        drawNodes();
        for (sim::Vehicle vehicle : simulation_.vehicles()) {
            drawVehicle(&vehicle);
        }
        drawInfo();

        window_.display();
    }

    void drawLanes() {
        auto lanes = simulation_.network().exportLanesForRender();

        for (const auto& lane : lanes) {
            // Рисуем саму полосу
            drawLaneCenterLine(lane);

            // Рисуем стоп-линию если есть
            if (lane.stopLineS > 0) {
                drawStopLine(lane);
            }
        }
    }

    void drawLaneCenterLine(const sim::RoadNetwork::LaneRender& lane) {
        if (lane.pts.size() < 2)
            return;

        // Вместо рисования одной линии, рисуем две границы полосы
        drawLaneBoundaries(lane);

        // Осевую линию можно нарисовать тонкой линией для ориентира
        drawCenterLine(lane);
    }

    void drawLaneBoundaries(const sim::RoadNetwork::LaneRender& lane) {
        if (lane.pts.size() < 2)
            return;

        // Цвета для разных типов полос
        sf::Color color = lane.isConnector
                              ? sf::Color(0, 150, 0)
                              : sf::Color::Blue;
        sf::Color centerColor = lane.isConnector
                                    ? sf::Color::Green
                                    : sf::Color(100, 100, 255);

        // Рисуем левую и правую границы полосы
        std::vector<sf::Vector2f> leftBoundary, rightBoundary;

        for (size_t i = 0; i < lane.pts.size(); ++i) {
            sim::Vec2 point = lane.pts[i];
            sim::Vec2 direction(1, 0); // направление по умолчанию

            // Вычисляем направление в текущей точке
            if (i == 0 && lane.pts.size() > 1) {
                // Первая точка - берем направление к следующей
                direction = normalized(lane.pts[i + 1] - lane.pts[i]);
            } else if (i > 0) {
                // Средние точки - усредняем направление от предыдущей к следующей
                if (i + 1 < lane.pts.size()) {
                    sim::Vec2 dir1 = normalized(lane.pts[i] - lane.pts[i - 1]);
                    sim::Vec2 dir2 = normalized(lane.pts[i + 1] - lane.pts[i]);
                    direction = normalized(dir1 + dir2);
                } else {
                    // Последняя точка - берем направление от предыдущей
                    direction = normalized(lane.pts[i] - lane.pts[i - 1]);
                }
            }

            // Перпендикуляр к направлению (влево)
            sim::Vec2 normal = sim::perpLeft(direction);
            normal = normalized(normal);

            // Смещаем точки на половину ширины полосы
            double halfWidth = lane.width / 2.0;
            sim::Vec2 leftPoint = point + normal * halfWidth;
            sim::Vec2 rightPoint = point - normal * halfWidth;

            leftBoundary.push_back(worldToScreen(leftPoint));
            rightBoundary.push_back(worldToScreen(rightPoint));
        }

        // Рисуем левую границу
        for (size_t i = 1; i < leftBoundary.size(); ++i) {
            drawThickLine(leftBoundary[i - 1], leftBoundary[i], 2.0f, color);
        }

        // Рисуем правую границу
        for (size_t i = 1; i < rightBoundary.size(); ++i) {
            drawThickLine(rightBoundary[i - 1], rightBoundary[i], 2.0f, color);
        }
    }

    void drawCenterLine(const sim::RoadNetwork::LaneRender& lane) {
        if (lane.pts.size() < 2)
            return;

        sf::Color centerColor = lane.isConnector
                                    ? sf::Color::Green
                                    : sf::Color(200, 200, 255);

        // Рисуем осевую линию пунктиром
        for (size_t i = 1; i < lane.pts.size(); ++i) {
            sf::Vector2f start = worldToScreen(lane.pts[i - 1]);
            sf::Vector2f end = worldToScreen(lane.pts[i]);

            // Простой пунктир - можно улучшить
            if (i % 2 == 0) {
                drawThickLine(start, end, 1.0f, centerColor);
            }
        }
    }

    void drawStopLine(const sim::RoadNetwork::LaneRender& lane) {
        if (lane.stopLineS <= 0)
            return;

        // Находим позицию стоп-линии вдоль полосы
        double accumulated = 0;
        for (size_t i = 1; i < lane.pts.size(); ++i) {
            double segmentLength = distance(lane.pts[i - 1], lane.pts[i]);
            if (accumulated + segmentLength >= lane.stopLineS) {
                double t = (lane.stopLineS.value() - accumulated) /
                           segmentLength;
                sim::Vec2 stopPos =
                    interpolate(lane.pts[i - 1], lane.pts[i], t);

                // Находим нормаль к направлению движения
                sim::Vec2 dir = normalized(lane.pts[i] - lane.pts[i - 1]);
                sim::Vec2 normal = sim::perpLeft(dir);

                // Смещаем на половину ширины полосы в обе стороны
                double halfWidth = lane.width / 2.0;
                sim::Vec2 leftStop = stopPos + normal * halfWidth;
                sim::Vec2 rightStop = stopPos - normal * halfWidth;

                // Рисуем стоп-линию между границами полосы
                sf::Vertex line[] = {
                    sf::Vertex(worldToScreen(leftStop), sf::Color::Red),
                    sf::Vertex(worldToScreen(rightStop), sf::Color::Red)
                };
                window_.draw(line, 2, sf::Lines);
                break;
            }
            accumulated += segmentLength;
        }
    }


    void drawDirectionArrow(const std::vector<sim::Vec2>& points,
                            const sf::Color& color) {
        if (points.size() < 2)
            return;

        // Берем последний сегмент для определения направления
        size_t n = points.size();
        sim::Vec2 dir = normalized(points[n - 1] - points[n - 2]);

        // Позиция стрелки - 80% длины полосы
        double arrowPos = 0.8;
        size_t segmentIndex = static_cast<size_t>((n - 1) * arrowPos);
        segmentIndex = std::min(segmentIndex, n - 2);

        double t = (n - 1) * arrowPos - segmentIndex;
        sim::Vec2 pos = interpolate(points[segmentIndex],
                                    points[segmentIndex + 1], t);

        // Рисуем стрелку
        sf::Vector2f screenPos = worldToScreen(pos);
        sf::Vector2f screenDir = worldToScreen(dir) - worldToScreen(
                                     sim::Vec2(0, 0));

        // Нормализуем и масштабируем направление
        float length = std::sqrt(
            screenDir.x * screenDir.x + screenDir.y * screenDir.y);
        if (length > 0) {
            screenDir.x = screenDir.x / length * 10.0f;
            screenDir.y = screenDir.y / length * 10.0f;
        }

        // Перпендикуляры для стрелки
        sf::Vector2f perp(-screenDir.y, screenDir.x);
        perp.x *= 0.3f;
        perp.y *= 0.3f;

        sf::Vertex arrow[] = {
            sf::Vertex(screenPos - screenDir, color),
            sf::Vertex(screenPos + perp, color),
            sf::Vertex(screenPos - perp, color),
            sf::Vertex(screenPos + perp, color)
        };
        window_.draw(arrow, 4, sf::Lines);
    }

    void drawNodes() {
        auto lanes = simulation_.network().exportLanesForRender();

        for (const auto& lane : lanes) {
            if (lane.pts.size() < 2)
                continue;

            // Рисуем саму полосу (границы)
            drawLaneBoundaries(lane);

            // Подписываем начало и конец полосы
            drawLaneLabel(lane.pts.front(), lane.id, "START");
            drawLaneLabel(lane.pts.back(), lane.id, "END");

            // // Также можно подписать середину полосы для ясности
            // if (lane.pts.size() >= 2) {
            //     size_t midIndex = lane.pts.size() / 2;
            //     drawLaneLabel(lane.pts[midIndex], lane.id, "L" + std::to_string(lane.id));
            // }
        }
    }

    void drawLaneLabel(const sim::Vec2& worldPos, sim::LaneId laneId,
                       const std::string& suffix) {
        static bool fontLoaded = false;

        if (!fontLoaded) {
            if (!font.loadFromFile(
                "C:/Users/User/CLionProjects/untitled1/arial.ttf"))
                return;
            fontLoaded = true;
        }

        sf::Vector2f screenPos = worldToScreen(worldPos);

        sf::Text text;
        text.setFont(font);
        text.setString("L" + std::to_string(laneId) + " " + suffix);
        text.setCharacterSize(10);
        text.setFillColor(sf::Color::Yellow);
        text.setStyle(sf::Text::Bold);

        // Центрируем текст
        sf::FloatRect textBounds = text.getLocalBounds();
        text.setOrigin(textBounds.width / 2, textBounds.height / 2);

        // Смещаем в зависимости от суффикса чтобы не накладывались
        if (suffix == "START") {
            text.setPosition(screenPos.x - 20, screenPos.y - 15);
        } else if (suffix == "END") {
            text.setPosition(screenPos.x + 20, screenPos.y + 15);
        } else {
            text.setPosition(screenPos.x, screenPos.y);
        }

        // Фон для читаемости
        sf::RectangleShape background(
            sf::Vector2f(textBounds.width + 30, textBounds.height + 10));
        background.setFillColor(sf::Color(0, 0, 0, 200));
        background.setOrigin(background.getSize().x / 2,
                             background.getSize().y / 2);
        background.setPosition(text.getPosition());

        window_.draw(background);
        window_.draw(text);
    }

    void drawInfo() {
        // Выводим информацию о количестве полос
        auto lanes = simulation_.network().exportLanesForRender();
        int regularLanes = 0, connectorLanes = 0;

        for (const auto& lane : lanes) {
            if (lane.isConnector)
                connectorLanes++;
            else
                regularLanes++;
        }

        // В реальной системе нужно использовать sf::Text для вывода текста
        // Здесь для простоты просто выводим в консоль
        static bool infoPrinted = false;
        if (!infoPrinted) {
            std::cout << "=== Road Network Info ===" << std::endl;
            std::cout << "Regular lanes: " << regularLanes << std::endl;
            std::cout << "Connector lanes: " << connectorLanes << std::endl;
            std::cout << "Total lanes: " << lanes.size() << std::endl;
            std::cout << "Use mouse wheel to zoom" << std::endl;
            infoPrinted = true;
        }
    }

    void drawThickLine(const sf::Vector2f& start, const sf::Vector2f& end,
                       float thickness, const sf::Color& color) {
        sf::Vector2f direction = end - start;
        sf::Vector2f unitDirection = direction / std::sqrt(
                                         direction.x * direction.x + direction.y
                                         * direction.y);
        sf::Vector2f unitPerpendicular(-unitDirection.y, unitDirection.x);

        sf::Vector2f offset = (thickness / 2.0f) * unitPerpendicular;

        sf::Vertex line[] = {
            sf::Vertex(start + offset, color),
            sf::Vertex(end + offset, color),
            sf::Vertex(end - offset, color),
            sf::Vertex(start - offset, color)
        };

        window_.draw(line, 4, sf::Quads);
    }

    sf::Vector2f worldToScreen(const sim::Vec2& worldPos) {
        return sf::Vector2f(
            (worldPos.x - 50.00) * scale_ + window_.getSize().x / 2,
            // Центруем X
            (50.00 - worldPos.y) * scale_ + window_.getSize().y / 2
            // Центруем Y и инвертируем
            );
    }

    double distance(const sim::Vec2& a, const sim::Vec2& b) {
        return std::sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
    }

    sim::Vec2 interpolate(const sim::Vec2& a, const sim::Vec2& b, double t) {
        return sim::Vec2(
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t
            );
    }
};

int main() {
    try {
        RoadNetworkVisualizer visualizer;
        visualizer.run();
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }

    return 0;
}
