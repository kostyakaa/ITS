#pragma once
#include <vector>
#include "road_network.h"
#include "signals.h"

namespace sim {

class Vehicle;
class SimObject;

struct SimulationClock {
    double now{0.0};  // текущее моделируемое время, сек
};

struct WorldContext {
    const RoadNetwork* net{nullptr};
    SignalController* signals{nullptr};
    SimulationClock* clock{nullptr};

    const std::vector<SimObject*>* objects{nullptr};
    const std::vector<Vehicle*>* vehicles{nullptr};

    Vehicle* findLeaderInLane(int laneId, double myS,
                              double* outGapMeters) const;

    [[nodiscard]] CarSignal carSignalForLane(int laneId) const;

    [[nodiscard]] Vehicle* getVehicle(int vehicleId) const;
};

}  // namespace sim
