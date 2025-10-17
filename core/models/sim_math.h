#pragma once
#include <cmath>
#include <algorithm>

namespace sim {
struct Vec2 {
    double x{0}, y{0};
    Vec2() = default;

    Vec2(double x_, double y_) : x(x_), y(y_) {}

    Vec2 operator+(const Vec2& o) const { return {x + o.x, y + o.y}; }
    Vec2 operator-(const Vec2& o) const { return {x - o.x, y - o.y}; }
    Vec2 operator*(double k) const { return {x * k, y * k}; }
    Vec2 operator/(double k) const { return {x / k, y / k}; }

    Vec2& operator+=(const Vec2& o) {
        x += o.x;
        y += o.y;
        return *this;
    }
};

// Скалярное произведение: a·b = ax * bx + ay * by
inline double dot(const Vec2& a, const Vec2& b) {
    return a.x * b.x + a.y * b.y;
}

// Векторное произведение: det |a b| = ax * by - ay * bx
inline double cross(const Vec2& a, const Vec2& b) {
    return a.x * b.y - a.y * b.x;
}

// длина вектора
inline double norm(const Vec2& v) {
    return std::sqrt(dot(v, v));
}

// нормализация: тот же вектор, но длиной 1
inline Vec2 normalized(const Vec2& v) {
    double n = norm(v);
    return (n > 1e-9) ? v / n : Vec2{1, 0};
}

// поворот вектора на +90°
inline Vec2 perpLeft(const Vec2& v) {
    return {-v.y, v.x};
}

// ограничение значения в диапазоне [lo, hi]
inline double clamp(double v, double lo, double hi) {
    return std::max(lo, std::min(hi, v));
}

// линейная интерполяция: a + t * (b - a)
inline double lerp(double a, double b, double t) {
    return a + (b - a) * t;
}

struct Pose {
    double x{0}, y{0}, theta{0};
};
}  // namespace sim
