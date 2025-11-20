#include "signals.h"
#include "world_context.h"

namespace sim {

void TrafficLightGroup::setProgram(const std::vector<SignalPhase>& phases) {
    prog_ = phases;
    phaseIdx_ = 0;
    tInPhase_ = 0.0;
    current_ = prog_.empty() ? CarSignal::Off : prog_[0].carState;
}

void TrafficLightGroup::update(double dt) {
    if (prog_.empty()) {
        current_ = CarSignal::Red;
        return;
    }

    tInPhase_ += dt;
    if (tInPhase_ >= prog_[phaseIdx_].duration) {
        tInPhase_ = 0.0;
        phaseIdx_ = (phaseIdx_ + 1) % static_cast<int>(prog_.size());
        current_ = prog_[phaseIdx_].carState;
    }
}

void PedestrianLight::setProgram(const std::vector<PedPhase>& phases) {
    prog_ = phases;
    phaseIdx_ = 0;
    tInPhase_ = 0.0;
    current_ = prog_.empty() ? PedSignal::Off : prog_[0].pedState;
}

void PedestrianLight::update(double dt) {
    if (prog_.empty())
        return;
    tInPhase_ += dt;
    if (tInPhase_ >= prog_[phaseIdx_].duration) {
        tInPhase_ = 0.0;
        phaseIdx_ = (phaseIdx_ + 1) % static_cast<int>(prog_.size());
        current_ = prog_[phaseIdx_].pedState;
    }
}

void SignalController::addCarGroup(TrafficLightGroup g) {
    carGroups_[g.id] = std::move(g);
}

void SignalController::addPedLight(PedestrianLight p) {
    pedLights_[p.id] = std::move(p);
}

TrafficLightGroup* SignalController::carGroup(int id) {
    auto it = carGroups_.find(id);
    return it == carGroups_.end() ? nullptr : &it->second;
}

PedestrianLight* SignalController::pedLight(int id) {
    auto it = pedLights_.find(id);
    return it == pedLights_.end() ? nullptr : &it->second;
}

void SignalController::update(double dt) {
    for (auto& kv : carGroups_)
        kv.second.update(dt);
    for (auto& kv : pedLights_)
        kv.second.update(dt);
}

void SignalController::applyAdaptiveLogic(const WorldContext& world) {
    auto* g1 = carGroup(1);
    auto* g2 = carGroup(2);
    if (!g1 || !g2)
        return;

    double q1 = estimateQueueLength(*g1, world);
    double q2 = estimateQueueLength(*g2, world);

    adaptPhaseDurations(*g1, q1, q2);
    adaptPhaseDurations(*g2, q2, q1);
}


void SignalController::adaptPhaseDurations(TrafficLightGroup& g, double myQueue,
                                           double otherQueue) {
    auto prog = g.program();
    auto& green = prog[2];

    double base = 20.0;
    double delta = (myQueue - otherQueue) * 2.0;

    green.duration = std::clamp(base + delta, 10.0, 40.0);

    g.setProgram(prog);
}

double SignalController::estimateQueueLength(const TrafficLightGroup& g,
                                             const WorldContext& world) {
    double count = 0.0;
    for (int laneId : g.controlledLaneIds) {
        double gap;
        auto* leader = world.findLeaderInLane(laneId, 0.0, &gap);
        if (leader)
            count++;
    }
    return count;
}


} // namespace sim
