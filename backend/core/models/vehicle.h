#pragma once
#include <optional>
#include <random>
#include "sim_object.h"
#include "routing.h"
#include "world_context.h"

namespace sim {

using VehicleId = int;

struct VehicleParams {
    double maxAccel{1.5}; // a_max
    double comfyDecel{1.2}; // b
    double desiredSpeed{14.0}; // Желаемая скорость в m/s
    double timeHeadway{1.5};
    // Желаемый временной интервал до препятсвия спереди
    double minGap{3.0}; // минимальный зазор при полной остановке
    // секунды латерального перехода (когда добавите LC)
    double viewDistance{80.0};
    double fovRad{0.7}; // ~149°
};

struct DriverProfile {
    double reactionMean{0.6}; // среднее время реакции на светофор
    double reactionJitter{0.3}; // добавка [0..jitter]
    double politeness{0.5}; // будущие уступки
    double aggression{0.5};
    double missProb{0.05}; // шанс «пропустить» кадр смены светофора
    double minLaneChangeDelay{5.0};
    // секунд - минимальное время после появления для перестроения
    double laneChangeDuration = 2.0; // секунд на полное перестроение
};

struct VisibleObject {
    SimObject* object;
    double distance;
    double speed;
    bool isInTargetLane;
};

enum class VehicleMode { Driving, Braking, Stopped, LaneChanging };

struct RNG {
    std::mt19937_64 eng;
    explicit RNG(uint64_t seed = 0xC0FFEE) : eng(seed) {}

    double uniform() {
        return std::uniform_real_distribution<double>(0.0, 1.0)(eng);
    }

    double uniform(double a, double b) {
        return std::uniform_real_distribution<double>(a, b)(eng);
    }

    int uniform(int a, int b) {
        return std::uniform_int_distribution<int>(a, b)(eng);
    }
};

enum class LaneChangeState { None, Planning, Requesting, Executing, Aborting };

struct LaneChangeRequest {
    LaneId target_lane;
    double request_time;
    bool urgent;
};

struct VisibleVehicle {
    Vehicle* vehicle;
    double distance;
    double relative_speed;
    bool is_in_target_lane;
};


class Vehicle : public SimObject {
public:
    Vehicle(const VehicleParams& vp, const DriverProfile& dp,
            LaneId lane, double s0, double v0,
            RouteTracker rt);

    static Vehicle randomVehicle(int from, RouteTracker rt);

    static inline double signedLongitudinalGap(const Vehicle* ego,
                                               const Vehicle* other) {
        double ds = other->s() - ego->s();
        double half_sum = 0.5 * (ego->length() + other->length());
        return ds - half_sum;
    }


    LaneId laneId() const { return lane_; }

    double s() const { return s_; }

    double v() const { return v_; }

    VehicleMode mode() const { return mode_; }

    Pose pose() const override;

    double boundingRadius() const override {
        return 0.5 * std::hypot(this->length(), this->width());
    }


    void update(double dt, WorldContext& world) override;

    RouteTracker& route() { return route_; }

    const RouteTracker& route() const { return route_; }

    std::optional<LaneId> nextConnector() const {
        return route_.nextConnector();
    }

private:
    VehicleParams params_;
    DriverProfile driver_;
    RNG rng_;

    LaneId lane_{-1};
    double s_{0.0}; // положение вдоль полосы (м)
    double d_{0.0}; // поперечный оффсет
    double v_{0.0}; // скорость (м/с)
    double a_{0.0}; // текущ. продольное ускорение
    VehicleMode mode_{VehicleMode::Driving};

    std::optional<CarSignal> perceivedSignal_;
    double nextSignalUpdateTime_{0.0};

    double timeStopped_{0.0};

    RouteTracker route_;

    void perceiveTrafficLight(WorldContext& world, const Lane& L);

    void computeLongitudinal(WorldContext& world, const Lane& L,
                             double* outTargetAccel);

    void integrateKinematics(double dt);

    void advanceAlongRoute(WorldContext& world, double dt);

    double idmAccel(double v, double vFront, double gap) const;

    std::vector<VisibleObject> getVisibleObjects(WorldContext& world);

    // ПЕРЕСТРОЙКА ААА
    void updateLaneChange(double dt, WorldContext& world);

    void checkLaneChangeRequirement(WorldContext& world);

    void handlePlanningState(WorldContext& world);

    void handleRequestingState(WorldContext& world);

    void executeLaneChange(double dt, WorldContext& world);

    void abortLaneChange(double dt, WorldContext& world);

    bool checkIfCanMergeSafely(const std::vector<VisibleVehicle>& visible);

    bool isLaneChangeStillSafe(WorldContext& world);

    void sendYieldRequests(const std::vector<VisibleVehicle>& vehicles,
                           WorldContext& world);

    int countYieldingVehicles(WorldContext& world);

    void receiveYieldRequest(VehicleId requester_id, bool is_urgent,
                             WorldContext& world);

    void startYielding(Vehicle* requester);

    void updateYieldingBehavior(WorldContext& world);

    void maintainYielding(Vehicle* other);

    void startLaneChangeExecution(WorldContext& world);

    void completeLaneChange(WorldContext& world);

    void updateLateralPosition();

    bool isLaneChangeUrgent() const;

    bool isYieldingTo(VehicleId vehicle_id) const;

    std::vector<VisibleVehicle> getVisibleVehiclesInLane(
        WorldContext& world, LaneId target_lane);

    LaneChangeState lc_state_ = LaneChangeState::None;
    std::optional<LaneChangeRequest> lc_request_;
    double planning_start_time_ = 0.0;
    double lateral_progress_ = 0.0;
    double time_since_spawn_ = 0.0;

    std::unordered_set<VehicleId> yielding_to_;
    std::unordered_map<VehicleId, double> received_requests_;

    double MAX_PLANNING_TIME = 5.0;

};

} // namespace sim
