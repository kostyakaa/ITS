#include "vehicle.h"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <utility>

namespace sim {

Vehicle::Vehicle(const VehicleParams& vp, const DriverProfile& dp,
                 LaneId lane, double s0, double v0, RouteTracker rt)
    : SimObject(ObjectType::Vehicle),
      params_(vp),
      driver_(dp),
      rng_(id() * 1469598103934665603ULL),
      lane_(lane),
      s_(s0),
      v_(v0),
      route_(std::move(rt)) {}

Vehicle Vehicle::randomVehicle(int from, RouteTracker rt) {
    DriverProfile dp{};
    VehicleParams vp{};
    return {vp, dp, from, 0, 0, std::move(rt)};
}

static thread_local const RoadNetwork* g_lastNet = nullptr;
static thread_local Pose g_lastPose;

Pose Vehicle::pose() const {
    if (!g_lastNet)
        return g_lastPose;
    const Lane* L = g_lastNet->getLane(lane_);
    if (!L) {
        return g_lastPose;
    }
    Pose p = L->poseAt(s_, d_);
    return p;
}

double Vehicle::idmAccel(double v, double vFront, double gap) const {
    const double a = params_.maxAccel;
    const double b = params_.comfyDecel;
    const double T = params_.timeHeadway;
    const double s0 = params_.minGap;
    const double v0 = params_.desiredSpeed;
    const double delta = 4.0;
    gap = std::max(0.1, gap);
    double dv = v - vFront;
    double sStar =
        s0 + std::max(0.0, v * T + v * dv / (2.0 * std::sqrt(a * b)));
    double termFree = 1.0 - std::pow(std::max(0.0, v) / v0, delta);
    double termInteract = -std::pow(sStar / gap, 2.0);
    return a * (termFree + termInteract);
}

void Vehicle::perceiveTrafficLight(WorldContext& world, const Lane& L) {
    CarSignal real = world.carSignalForLane(L.id);
    double t = world.clock->now;

    if (!perceivedSignal_.has_value()) {
        perceivedSignal_ = real;
        nextSignalUpdateTime_ = t + driver_.reactionMean +
                                rng_.uniform(0.0, driver_.reactionJitter);
        return;
    }

    if (t >= nextSignalUpdateTime_) {
        if (rng_.uniform() < driver_.missProb) {
            nextSignalUpdateTime_ = t + driver_.reactionMean +
                                    rng_.uniform(0.0, driver_.reactionJitter);
        } else {
            perceivedSignal_ = real;
            nextSignalUpdateTime_ = t + driver_.reactionMean +
                                    rng_.uniform(0.0, driver_.reactionJitter);
        }
    }
}

void Vehicle::computeLongitudinal(WorldContext& world, const Lane& L,
                                  double* outTargetAccel) {
    double gapToLeader = 1e9;
    double vFront = params_.desiredSpeed;
    if (const Vehicle* leader =
        world.findLeaderInLane(L.id, s_, &gapToLeader)) {
        vFront = leader->v();
    }
    if (L.isConnector || abs(s_ - L.stopLineS.value()) < 5) {
        std::vector<VisibleObject> objects = getVisibleObjects(world);
        if (!objects.empty()) {
            vFront = std::min(vFront, objects[0].speed);
            gapToLeader = std::min(gapToLeader, objects[0].distance - 10);
        }
    }

    double vLimit = std::min(params_.desiredSpeed, L.speedLimit);

    perceiveTrafficLight(world, L);
    if (L.stopLineS && perceivedSignal_.has_value()) {
        double stopLinePos = *L.stopLineS;
        double gapTL = stopLinePos - s_ - params_.length * 0.5;

        if (*perceivedSignal_ == CarSignal::Red) {
            double comfortBuffer = params_.minGap;

            if (gapTL < gapToLeader && gapTL > 0 && gapTL < 5) {
                gapToLeader = std::max(comfortBuffer, gapTL);
                vFront = 0.0;
            }
        } else if (*perceivedSignal_ == CarSignal::Yellow) {
            if (gapTL < gapToLeader && gapTL > 0) {
                double yellowBuffer = params_.minGap * 1.0;
                gapToLeader = std::max(yellowBuffer, gapTL);
                vFront = 0.5 * params_.desiredSpeed;
            }
        }
    }

    double aIDM = idmAccel(v_, vFront, gapToLeader);

    if (gapToLeader > 200.0) {
        if (v_ < vLimit)
            aIDM = std::max(aIDM, 0.2 * params_.maxAccel);
        else if (v_ > vLimit)
            aIDM = std::min(aIDM, -0.5 * params_.comfyDecel);
    }

    // aIDM = std::clamp(aIDM, -params_.comfyDecel * 2.0, params_.maxAccel);

    *outTargetAccel = aIDM;
}

void Vehicle::integrateKinematics(double dt) {
    v_ = std::max(0.0, v_ + a_ * dt);
    s_ = s_ + v_ * dt;
    if (v_ < 0.2)
        timeStopped_ += dt;
    else
        timeStopped_ = 0.0;

    if (v_ < 0.01)
        mode_ = VehicleMode::Stopped;
    else if (a_ < -0.2)
        mode_ = VehicleMode::Braking;
    else
        mode_ = VehicleMode::Driving;
}

void Vehicle::advanceAlongRoute(WorldContext& world, double dt) {
    const RoadNetwork* net = world.net;
    g_lastNet = net;
    const Lane* L = net->getLane(lane_);
    if (!L)
        return;

    double len = L->length();
    while (s_ >= len) {
        double leftover = s_ - len;
        const RoutePlan& rp = route_.plan();
        int idx = route_.plan().startIndex;
        int nextIdx = -1;
        for (int i = idx; i < (int)rp.steps.size(); ++i) {
            if (rp.steps[i].lane == lane_) {
                nextIdx = i + 1;
                break;
            }
        }
        if (nextIdx < 0 || nextIdx >= (int)rp.steps.size()) {
            s_ = len;
            v_ = 0.0;
            a_ = 0.0;
            return;
        }
        lane_ = rp.steps[nextIdx].lane;
        route_.advanceIfEntered(lane_);
        s_ = 0.0 + leftover;
        L = net->getLane(lane_);
        if (!L)
            return;
        len = L->length();
    }
}

void Vehicle::updateLaneChange(double dt, WorldContext& world) {
    time_since_spawn_ += dt;

    switch (lc_state_) {
        case LaneChangeState::None:
            checkLaneChangeRequirement(world);
            break;
        case LaneChangeState::Planning:
            handlePlanningState(world);
            break;
        case LaneChangeState::Requesting:
            handleRequestingState(world);
            break;
        case LaneChangeState::Executing:
            executeLaneChange(dt, world);
            break;
        case LaneChangeState::Aborting:
            abortLaneChange(dt, world);
            break;
    }

    updateYieldingBehavior(world);
}

void Vehicle::checkLaneChangeRequirement(WorldContext& world) {
    if (time_since_spawn_ < 1.0)
        return;
    if (lc_state_ != LaneChangeState::None)
        return;

    const RoutePlan& plan = route_.plan();
    int current_index = route_.plan().startIndex;

    for (int i = current_index; i < (int)route_.plan().steps.size(); ++i) {
        if (route_.plan().steps[i].lane == lane_) {
            current_index = i;
            break;
        }
    }

    if (current_index + 1 < plan.steps.size()) {
        LaneId current_lane = lane_;
        LaneId next_lane = plan.steps[current_index + 1].lane;

        const Lane* current_lane_ptr = world.net->getLane(current_lane);
        if (!current_lane_ptr)
            return;

        bool is_left_neighbor = (current_lane_ptr->left == next_lane);
        bool is_right_neighbor = (current_lane_ptr->right == next_lane);

        if (is_left_neighbor || is_right_neighbor) {
            const Lane* current_lane_info = world.net->getLane(current_lane);
            double distance_to_end = current_lane_info->length() - s_;

            if (distance_to_end < 30.0 && distance_to_end > 2.0) {
                // std::cout << "Perest!!! " << id() << "\n";
                lc_request_ =
                    LaneChangeRequest{.target_lane = next_lane,
                                      .request_time = world.clock->now,
                                      .urgent = (distance_to_end < 10.0)};
                lc_state_ = LaneChangeState::Planning;
            }
        }
    }
}

void Vehicle::handlePlanningState(WorldContext& world) {
    if (planning_start_time_ == 0.0) {
        planning_start_time_ = world.clock->now;
    }

    if (world.clock->now - planning_start_time_ > MAX_PLANNING_TIME) {
        // std::cout << "KUHUHKHUHIL\n";
        startLaneChangeExecution(world);
        planning_start_time_ = 0.0;
        return;
    }

    auto visible = getVisibleVehiclesInLane(world, lc_request_->target_lane);
    // std::cout << visible.size() << " " << id() << '\n';
    if (visible.empty()) {
        startLaneChangeExecution(world);
    } else {
        bool can_merge = checkIfCanMergeSafely(visible);
        can_merge
            ? startLaneChangeExecution(world)
            : sendYieldRequests(visible, world);
    }
}

void Vehicle::handleRequestingState(WorldContext& world) {
    int yielding_count = countYieldingVehicles(world);

    if (yielding_count > 0 || isLaneChangeUrgent()) {
        startLaneChangeExecution(world);
    } else if (world.clock->now - lc_request_->request_time > 8.0) {
        lc_state_ = lc_request_->urgent
                        ? LaneChangeState::Executing
                        : LaneChangeState::Aborting;
    }
}

void Vehicle::executeLaneChange(double dt, WorldContext& world) {
    lateral_progress_ += dt / driver_.laneChangeDuration_;

    if (lateral_progress_ >= 1.0) {
        completeLaneChange(world);
    } else {
        updateLateralPosition();
        if (!isLaneChangeStillSafe(world)) {
            // std::cout << id() << " aboring...\n";
            lc_state_ = LaneChangeState::Aborting;
        }
    }
}

void Vehicle::abortLaneChange(double dt, WorldContext& world) {
    lateral_progress_ -= dt / driver_.laneChangeDuration_;
    if (lateral_progress_ <= 0.0) {
        lateral_progress_ = 0.0;
        lc_state_ = LaneChangeState::None;
        lc_request_.reset();
    }
}

std::vector<VisibleVehicle> Vehicle::getVisibleVehiclesInLane(
    WorldContext& world, LaneId target_lane) {
    std::vector<VisibleVehicle> result;

    for (auto* obj : *world.vehicles) {
        if (obj->id() == id() || obj->type() != ObjectType::Vehicle)
            continue;

        Vehicle* other = static_cast<Vehicle*>(obj);
        if (!canSee(*other, params_.viewDistance, 4))
            // Чтобы слепой не стал помехой для фуры
            continue;

        if (other->laneId() == target_lane) {
            double distance = calculateDistanceTo(*other);
            double relative_speed = v_ - other->v();
            result.push_back({other, distance, relative_speed, true});
        }
    }

    std::sort(result.begin(), result.end(),
              [](const VisibleVehicle& a, const VisibleVehicle& b) {
                  return a.distance < b.distance;
              });

    return result;
}

std::vector<VisibleObject> Vehicle::getVisibleObjects(WorldContext& world) {
    std::vector<VisibleObject> result;

    for (auto* obj : *world.objects) {
        if (obj->id() == id())
            continue;

        // Vehicle* other = static_cast<Vehicle*>(obj);
        if (!canSee(*obj, params_.viewDistance, params_.fovRad))
            continue;

        double distance = calculateDistanceTo(*obj);
        double speed = 0; // TODO для пешеходов
        result.push_back({obj, distance, speed, true});
    }

    for (auto* obj : *world.vehicles) {
        if (obj->id() == id())
            continue;

        Vehicle* other = static_cast<Vehicle*>(obj);
        if (!canSee(*other, params_.viewDistance, params_.fovRad))
            continue;

        double distance = calculateDistanceTo(*other);
        double speed = other->v();
        result.push_back({other, distance, speed, true});
    }

    std::sort(result.begin(), result.end(),
              [](const VisibleObject& a, const VisibleObject& b) {
                  return a.distance < b.distance;
              });

    return result;
}

bool Vehicle::checkIfCanMergeSafely(
    const std::vector<VisibleVehicle>& visible) {
    for (const auto& v : visible) {
        double time_to_intercept = v.distance / (v.relative_speed + 0.1);
        if (time_to_intercept < driver_.laneChangeDuration_ * 1.2) {
            return false;
        }
    }
    return true;
}

bool Vehicle::isLaneChangeStillSafe(WorldContext& world) {
    auto visible = getVisibleVehiclesInLane(world, lc_request_->target_lane);
    for (const auto& v : visible) {
        if (v.distance < params_.minGap * 2.0)
            return false;
    }
    return true;
}

void Vehicle::sendYieldRequests(const std::vector<VisibleVehicle>& vehicles,
                                WorldContext& world) {
    for (const auto& v : vehicles) {
        v.vehicle->receiveYieldRequest(id(), lc_request_->urgent, world);
    }
    lc_state_ = LaneChangeState::Requesting;
}

void Vehicle::receiveYieldRequest(VehicleId requester_id, bool is_urgent,
                                  WorldContext& world) {
    Vehicle* requester = world.getVehicle(requester_id);
    if (!requester)
        return;

    if (requester->s_ < s_ || abs(requester->s_ - s_) < 2) {
        return;
    }

    received_requests_[requester_id] = world.clock->now;

    double yield_prob = driver_.politeness;
    if (is_urgent)
        yield_prob += 0.3;
    if (v_ < 5.0)
        yield_prob += 0.2;

    if (rng_.uniform() < yield_prob) {
        yielding_to_.insert(requester_id);
        startYielding(requester);
    }
}

int Vehicle::countYieldingVehicles(WorldContext& world) {
    auto visible = getVisibleVehiclesInLane(world, lc_request_->target_lane);
    int count = 0;
    for (const auto& v : visible) {
        if (v.vehicle->isYieldingTo(id()))
            count++;
    }
    return count;
}

// Начало уступки
void Vehicle::startYielding(Vehicle* requester) {
    // std::cout << id() << " yielding to " << requester->id() << "\n";
    double distance = calculateDistanceTo(*requester);
    if (distance < params_.minGap * 3.0) {
        a_ = std::min(a_, -params_.comfyDecel);
    }
}

// Обновление поведения уступки
void Vehicle::updateYieldingBehavior(WorldContext& world) {
    for (auto it = yielding_to_.begin(); it != yielding_to_.end();) {
        if (auto* other = world.getVehicle(*it)) {
            if (other->s() > s_ + 10.0 || abs(other->s() - s_) < 3) {
                it = yielding_to_.erase(it);
            } else {
                maintainYielding(other);
                ++it;
            }
        } else {
            it = yielding_to_.erase(it);
        }
    }

    // Очистка старых запросов
    auto now = world.clock->now;
    for (auto it = received_requests_.begin();
         it != received_requests_.end();) {
        if (now - it->second > 10.0)
            it = received_requests_.erase(it);
        else
            ++it;
    }
}

void Vehicle::maintainYielding(Vehicle* other) {
    double distance = calculateDistanceTo(*other);
    if (distance < params_.minGap * 2.0 && v_ > 0.1) {
        // std::cout << id() << " i need to stop\n";
        a_ = std::min(a_, -params_.comfyDecel * 0.7);
    }
}

void Vehicle::startLaneChangeExecution(WorldContext& world) {
    lc_state_ = LaneChangeState::Executing;
    lateral_progress_ = 0.0;
}

// Завершение перестроения
void Vehicle::completeLaneChange(WorldContext& world) {
    lane_ = lc_request_->target_lane;
    d_ = 0.0;
    lateral_progress_ = 0.0;
    lc_state_ = LaneChangeState::None;
    lc_request_.reset();
    yielding_to_.clear();
}

// Обновление боковой позиции
void Vehicle::updateLateralPosition() {
    double target_d =
        (lc_request_->target_lane > lane_) ? -params_.width : params_.width;
    double smooth_t =
        lateral_progress_ * lateral_progress_ * (3 - 2 * lateral_progress_);
    d_ = target_d * smooth_t;
    v_ *= (1.0 - 0.1 * smooth_t);
}

bool Vehicle::isLaneChangeUrgent() const {
    return lc_request_ && lc_request_->urgent;
}

bool Vehicle::isYieldingTo(VehicleId vehicle_id) const {
    return yielding_to_.count(vehicle_id) > 0;
}

void Vehicle::update(double dt, WorldContext& world) {
    g_lastNet = world.net;
    updateLaneChange(dt, world);

    const Lane* L = world.net->getLane(lane_);

    if ((lc_request_.has_value() && ((lc_state_ != LaneChangeState::Executing &&
                                      lc_state_ != LaneChangeState::Aborting) ||
                                     (L
                                      && L->stopLineS.value_or(0) - s_ < 5))) ||
        !yielding_to_.empty()) {
        v_ = 0.0;
        a_ = 0.0;
        mode_ = VehicleMode::Stopped;
    } else {
        if (L) {
            double target_accel = 0.0;
            computeLongitudinal(world, *L, &target_accel);
            a_ = target_accel;
        }
        integrateKinematics(dt);
    }

    if (lc_state_ == LaneChangeState::None) {
        advanceAlongRoute(world, dt);
    }
}

} // namespace sim
