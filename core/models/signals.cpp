#include "signals.h"

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

} // namespace sim
