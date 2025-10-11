#pragma once
#include "sim_object.h"
#include "signals.h"

namespace sim {

class TrafficLightEntity : public SimObject {
   public:
    TrafficLightEntity(uint64_t id, int groupId, const Vec2& pos,
                       double thetaRad = 0.0)
        : SimObject(id, ObjectType::TrafficLight),
          groupId_(groupId),
          pos_(pos),
          theta_(thetaRad) {}

    [[nodiscard]] int groupId() const { return groupId_; }

    [[nodiscard]] Pose pose() const override {
        return {pos_.x, pos_.y, theta_};
    }
    [[nodiscard]] double boundingRadius() const override { return 0.5; }

    void update(double dt, WorldContext& world) override {
        (void)dt;
        (void)world;
    }

   private:
    int groupId_;
    Vec2 pos_;
    double theta_;
};

}  // namespace sim
