#pragma once
#include <vector>
#include <utility>
#include "sim_math.h"

namespace sim {

class Polyline {
   public:
    Polyline() = default;

    explicit Polyline(std::vector<Vec2> pts);

    void setPoints(std::vector<Vec2> pts);

    [[nodiscard]] const std::vector<Vec2>& points() const { return points_; }

    [[nodiscard]] double length() const { return totalLen_; }

    [[nodiscard]] bool empty() const { return points_.size() < 2; }

    // Выборка точки и касательной по длине s вдоль кривой [0..length]
    [[nodiscard]] std::pair<Vec2, Vec2> sample(double s) const;

    // Нормаль в точке s (перпендикуляр к касательной, налево)
    [[nodiscard]] Vec2 normalAt(double s) const;

    // Поза с поперечным смещением d (влево относительно направления)
    [[nodiscard]] Pose poseAt(double s, double d = 0.0,
                              double headingOffset = 0.0) const;

    // Проекция произвольной точки на полилинию: возвращает параметр s (приблиз.)
    [[nodiscard]] double projectS(const Vec2& p) const;

   private:
    std::vector<Vec2> points_;
    std::vector<double> accLen_;
    double totalLen_{0.0};
    void recomputeLengths();
};

std::vector<Vec2> offsetPolyline(const std::vector<Vec2>& pts, double offset);

Vec2 cubicBezier(const Vec2& p0, const Vec2& p1, const Vec2& p2, const Vec2& p3,
                 double t);

std::vector<Vec2> bezierConnector(const Vec2& p0, const Vec2& dir0,
                                  const Vec2& p3, const Vec2& dir1,
                                  double handleLen0, double handleLen1,
                                  int steps);

}  // namespace sim
