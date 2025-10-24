#include "world_context.h"
#include "vehicle.h"

namespace sim {

Vehicle* WorldContext::findLeaderInLane(int laneId, double myS,
                                        double* outGapMeters) const {
    Vehicle* best = nullptr;
    double bestGap = 1e18;
    if (!vehicles)
        return nullptr;
    for (Vehicle* v : *vehicles) {
        if (v->laneId() != laneId)
            continue;
        double gap = v->s() - myS - v->boundingRadius();
        if (gap > 0.0 && gap < bestGap) {
            bestGap = gap;
            best = v;
        }
    }
    if (best && outGapMeters)
        *outGapMeters = bestGap;
    return best;
}

CarSignal WorldContext::carSignalForLane(int laneId) const {
    if (!net)
        return CarSignal::Green;
    const Lane* L = net->getLane(laneId);
    if (!L || !L->signalGroupId)
        return CarSignal::Green;
    if (!signals)
        return CarSignal::Green;
    auto* g = signals->carGroup(*L->signalGroupId);
    return g ? g->state() : CarSignal::Green;
}

Vehicle* WorldContext::getVehicle(int vehicleId) const {
    for (Vehicle* vehicle : *vehicles) {
        if (vehicle->id() == vehicleId) {
            return vehicle;
        }
    }
    return nullptr;
}

}  // namespace sim
