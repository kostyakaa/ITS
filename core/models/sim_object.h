#pragma once
#include <cstdint>
#include <optional>
#include "sim_math.h"

namespace sim {

enum class ObjectType { Vehicle, TrafficLight, PedLight, Unknown };

class WorldContext;

class SimObject {
   public:
    explicit SimObject(uint64_t id, ObjectType t) : id_(id), type_(t) {}
    virtual ~SimObject() = default;

    [[nodiscard]] uint64_t id() const { return id_; }
    [[nodiscard]] ObjectType type() const { return type_; }

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
        double dist2 = dx * dx + dy * dy;
        if (dist2 > viewDist * viewDist)
            return false;
        if (fovRad >= 3.14159)
            return true;  // — считаем круговым
        double angle = std::atan2(dy, dx);
        double d = std::fabs(angleDiff(a.theta, angle));
        return d <= (fovRad * 0.5);
    }

    [[nodiscard]] double calculateDistanceTo(const SimObject& other) const {
        Pose my_pose = pose();
        Pose other_pose = other.pose();

        double dx = other_pose.x - my_pose.x;
        double dy = other_pose.y - my_pose.y;
        return std::sqrt(dx * dx + dy * dy);
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
};

}  // namespace sim
