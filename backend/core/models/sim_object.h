#pragma once
#include <cstdint>
#include <optional>
#include "sim_math.h"

namespace sim {

enum class ObjectType { Vehicle, TrafficLight, PedLight, Unknown };

class WorldContext;

class SimObject {
public:
    explicit SimObject(ObjectType t, double width, double length) : type_(t) {
        static uint64_t simObjectId = 0;
        id_ = simObjectId++;
        width_ = width;
        length_ = length;
    }

    virtual ~SimObject() = default;

    [[nodiscard]] uint64_t id() const { return id_; }
    [[nodiscard]] ObjectType type() const { return type_; }
    [[nodiscard]] double length() const { return length_; }
    [[nodiscard]] double width() const { return width_; }

    // Поза в мировых координатах (x, y, theta)
    [[nodiscard]] virtual Pose pose() const = 0;

    // Радиус окружности для грубой коллизии/видимости
    [[nodiscard]] virtual double boundingRadius() const = 0;

    // Видимость: проверка дистанции и поля зрения.
    [[nodiscard]] bool canSee(const SimObject& other, double viewDist,
                              double fovRad) const {
        Pose a = pose();
        Pose b = other.pose();
        double dx = b.x - a.x, dy = b.y - a.y;
        double dist = std::sqrt(dx * dx + dy * dy);

        double maxViewDist = viewDist + other.boundingRadius() +
                             boundingRadius();
        if (dist > maxViewDist)
            return false;

        if (fovRad >= 3.14159)
            return true;

        double angle = std::atan2(dy, dx);
        double d = std::fabs(angleDiff(a.theta, angle));
        return d <= (fovRad * 0.5);
    }

    [[nodiscard]] double calculateDistanceTo(const SimObject& other) const {
        Pose a = pose();
        Pose b = other.pose();

        double dx = b.x - a.x;
        double dy = b.y - a.y;

        double dist = std::sqrt(dx * dx + dy * dy);
        if (dist < 1e-6)
            return 0.0;

        double angle_to_other = std::atan2(dy, dx);

        double forward_component = std::cos(angleDiff(a.theta, angle_to_other));

        double distance_along_axis = dist * forward_component;

        double my_front_offset = length_ * 0.5;
        double other_rear_offset = other.length() * 0.5;

        double gap = distance_along_axis - (
                         my_front_offset + other_rear_offset);

        return gap > 0.0 ? gap : 0.0;
    }


    virtual void update(double dt, WorldContext& world) = 0;

protected:
    static double angleDiff(double a, double b) {
        double d = std::fmod(b - a + 3.1415926535, 2 * 3.1415926535);
        if (d < 0)
            d += 2 * 3.1415926535;
        return d - 3.1415926535;
    }

private:
    uint64_t id_;
    ObjectType type_;
    double length_{0.0};
    double width_{0.0};
};

} // namespace sim
