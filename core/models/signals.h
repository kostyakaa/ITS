#pragma once
#include <vector>
#include <unordered_map>
#include <string>
#include "sim_math.h"

namespace sim {

enum class CarSignal { Red, RedYellow, Green, Yellow, Off };

enum class PedSignal { DontWalk, Walk, FlashingDontWalk, Off };

struct SignalPhase {
    double duration; // сек
    CarSignal carState;
};

struct PedPhase {
    double duration; // сек
    PedSignal pedState;
};

class TrafficLightGroup {
public:
    int id{-1};
    std::string name;
    std::vector<int> controlledLaneIds;

    void setProgram(const std::vector<SignalPhase>& phases);
    void update(double dt);
    [[nodiscard]] CarSignal state() const { return current_; }
    [[nodiscard]] double timeInPhase() const { return tInPhase_; }
    [[nodiscard]] int phaseIndex() const { return phaseIdx_; }

private:
    std::vector<SignalPhase> prog_;
    int phaseIdx_{0};
    double tInPhase_{0.0};
    CarSignal current_{CarSignal::Red};
};

class PedestrianLight {
public:
    int id{-1};
    std::string name;
    Vec2 position;

    void setProgram(const std::vector<PedPhase>& phases);
    void update(double dt);
    [[nodiscard]] PedSignal state() const { return current_; }

private:
    std::vector<PedPhase> prog_;
    int phaseIdx_{0};
    double tInPhase_{0.0};
    PedSignal current_{PedSignal::DontWalk};
};

class SignalController {
public:
    void addCarGroup(TrafficLightGroup g);
    void addPedLight(PedestrianLight p);

    TrafficLightGroup* carGroup(int id);
    PedestrianLight* pedLight(int id);

    void update(double dt);

    const std::unordered_map<int, TrafficLightGroup>& carGroups() const {
        return carGroups_;
    }

    const std::unordered_map<int, PedestrianLight>& pedLights() const {
        return pedLights_;
    }

private:
    std::unordered_map<int, TrafficLightGroup> carGroups_;
    std::unordered_map<int, PedestrianLight> pedLights_;
};

} // namespace sim
