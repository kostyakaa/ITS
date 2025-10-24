#include "geometry.h"
#include <cassert>
#include <limits>

namespace sim {

Polyline::Polyline(std::vector<Vec2> pts) {
    setPoints(std::move(pts));
}

void Polyline::setPoints(std::vector<Vec2> pts) {
    points_ = std::move(pts);
    recomputeLengths();
}

void Polyline::recomputeLengths() {
    accLen_.clear();
    totalLen_ = 0.0;
    if (points_.size() < 2) {
        accLen_.push_back(0.0);
        return;
    }
    accLen_.reserve(points_.size());
    accLen_.push_back(0.0);
    for (size_t i = 1; i < points_.size(); ++i) {
        totalLen_ += norm(points_[i] - points_[i - 1]);
        accLen_.push_back(totalLen_);
    }
}

std::pair<Vec2, Vec2> Polyline::sample(double s) const {
    if (points_.size() < 2)
        return {points_.empty() ? Vec2{} : points_.front(), Vec2{1, 0}};
    s = clamp(s, 0.0, totalLen_);

    size_t lo = 0, hi = accLen_.size() - 1;
    while (lo + 1 < hi) {
        size_t mid = (lo + hi) / 2;
        if (accLen_[mid] <= s)
            lo = mid;
        else
            hi = mid;
    }
    double segStart = accLen_[lo];
    double segLen = std::max(1e-9, accLen_[lo + 1] - accLen_[lo]);
    double t = (s - segStart) / segLen;
    Vec2 p0 = points_[lo], p1 = points_[lo + 1];
    Vec2 pos = p0 * (1.0 - t) + p1 * t;
    Vec2 tan = normalized(p1 - p0);
    return {pos, tan};
}

Vec2 Polyline::normalAt(double s) const {
    auto [_, t] = sample(s);
    Vec2 n = perpLeft(t);
    double nlen = norm(n);
    return (nlen > 1e-9) ? n / nlen : Vec2{0, 1};
}

Pose Polyline::poseAt(double s, double d, double headingOffset) const {
    auto [p, t] = sample(s);
    Vec2 n = perpLeft(t);
    double nlen = norm(n);
    if (nlen > 1e-9)
        n = n / nlen;
    p = p + n * d;
    double theta = std::atan2(t.y, t.x) + headingOffset;
    return {p.x, p.y, theta};
}

double Polyline::projectS(const Vec2& p) const {
    if (points_.size() < 2)
        return 0.0;
    double bestS = 0.0, bestD2 = std::numeric_limits<double>::max();
    for (size_t i = 0; i + 1 < points_.size(); ++i) {
        Vec2 a = points_[i], b = points_[i + 1], ab = b - a;
        double L2 = dot(ab, ab);
        if (L2 < 1e-12)
            continue;
        double t = clamp(dot(p - a, ab) / L2, 0.0, 1.0);
        Vec2 proj = a + ab * t;
        double d2 = dot(p - proj, p - proj);
        if (d2 < bestD2) {
            bestD2 = d2;
            bestS = accLen_[i] + std::sqrt(L2) * t;
        }
    }
    return bestS;
}

std::vector<Vec2> offsetPolyline(const std::vector<Vec2>& pts, double offset) {
    std::vector<Vec2> out;
    out.reserve(pts.size());
    if (pts.size() < 2)
        return pts;
    for (size_t i = 0; i < pts.size(); ++i) {
        Vec2 t0{0, 0}, t1{0, 0};
        if (i > 0) {
            t0 = normalized(pts[i] - pts[i - 1]);
        }
        if (i + 1 < pts.size()) {
            t1 = normalized(pts[i + 1] - pts[i]);
        }
        Vec2 t =
            (i == 0) ? t1 : (i + 1 == pts.size() ? t0 : normalized(t0 + t1));
        Vec2 n = perpLeft(t);
        n = normalized(n);
        out.push_back(pts[i] + n * offset);
    }
    return out;
}

Vec2 cubicBezier(const Vec2& p0, const Vec2& p1, const Vec2& p2, const Vec2& p3,
                 double t) {
    double u = 1 - t;
    return p0 * (u * u * u) + p1 * (3 * u * u * t) + p2 * (3 * u * t * t) +
           p3 * (t * t * t);
}

std::vector<Vec2> bezierConnector(const Vec2& p0, const Vec2& dir0,
                                  const Vec2& p3, const Vec2& dir1,
                                  double handleLen0, double handleLen1,
                                  int steps) {
    Vec2 n0 = normalized(dir0);
    Vec2 n1 = normalized(dir1);
    Vec2 p1 = p0 + n0 * handleLen0;
    Vec2 p2 = p3 - n1 * handleLen1;
    std::vector<Vec2> pts;
    pts.reserve(steps + 1);
    for (int i = 0; i <= steps; ++i) {
        double t = double(i) / steps;
        pts.push_back(cubicBezier(p0, p1, p2, p3, t));
    }
    return pts;
}

}  // namespace sim
