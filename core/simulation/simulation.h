#pragma once
#include "../models/road_network.h"
#include "../models/signals.h"
#include "../models/routing.h"
#include "../models/world_context.h"
#include "../models/vehicle.h"
#include <iostream>

namespace sim {

class Simulation {

   public:
    Simulation()
        : world_(&network_, &controller_, &clock_, &object_ptrs_,
                 &vehicle_ptrs_),
          pathfinder_(&network_) {}

    void initRoadNetwork() {
        buildRoad(Vec2(42.75, 50.00), Vec2(0, 50.00), "North_Out");
        buildRoad(Vec2(50.00, 57.14), Vec2(50.00, 100.00), "South_Out");
        buildRoad(Vec2(57.00, 50.00), Vec2(99.82, 50.00), "East_Out");
        buildRoad(Vec2(50.00, 42.92), Vec2(50.00, 0), "West_Out");

        createIntersectionConnectors();
        initSignals();
    }

    Vehicle& addVehicle(const VehicleParams& params,
                        const DriverProfile& driver, LaneId startLane,
                        const Goal& goal, double s0 = 0.0) {
        RouteTracker route(&network_);
        route.setGoalAndPlan(startLane, goal, pathfinder_);
        vehicles_.emplace_back(static_cast<int>(vehicles_.size()) + 1, params,
                               driver, startLane, s0, 0.0, std::move(route));
        syncVehicles();
        return vehicles_.back();
    }

    void update(double dt) {
        clock_.now += dt;
        controller_.update(dt);
        for (auto& v : vehicles_)
            v.update(dt, world_);
        kill();
    }

    void buildRoad(const Vec2& from, const Vec2& to, const std::string& name) {
        auto result = network_.addStraightRoad(from, to, 2, 3.5, 50.0);
        // std::cout << "Built road: " << name
        //           << " with " << result.forward.size()
        //           << " forward lanes, " << result.backward.size()
        //           << " backward lanes" << std::endl;
    }

    void createIntersectionConnectors() {
        network_.addConnector(2, 7, 6.00, 6.00, 30);
        network_.addConnector(2, 5, 5.00, 5.00, 30);

        // network_.addConnector(4, 5, 7.00, 7.00, 30);
        // network_.addConnector(4, 7, 8.00, 8.00, 30);

        network_.addConnector(2, 9, 7.00, 7.00, 30);
        network_.addConnector(4, 11, 8.00, 8.00, 30);
        network_.addConnector(4, 13, 6.00, 0.10, 30);

        network_.addConnector(10, 15, 6.00, 6.00, 30);
        network_.addConnector(10, 13, 5.00, 5.00, 30);
        network_.addConnector(12, 7, 0.5, 0.5, 30);
        network_.addConnector(12, 5, 6.00, 0.10, 30);
        network_.addConnector(12, 3, 8.00, 8.00, 30);
        network_.addConnector(10, 1, 7.00, 7.00, 30);

        network_.addConnector(6, 11, 6.00, 6.00, 30);
        network_.addConnector(6, 9, 5.00, 5.00, 30);
        network_.addConnector(6, 13, 5.00, 5.00, 30);
        network_.addConnector(8, 1, 5.00, 1, 30);
        network_.addConnector(8, 3, 0.50, 0.5, 30);
        network_.addConnector(8, 15, 5.00, 5.00, 30);
    }

    void initSignals() {
        SignalPhase red{20, CarSignal::Red};
        SignalPhase green{20, CarSignal::Green};
        TrafficLightGroup group1;
        TrafficLightGroup group2;
        group1.id = 1;
        group2.id = 2;
        group1.setProgram({red, green});
        group2.setProgram({green, red});
        network_.getLane(2)->signalGroupId = group1.id;
        network_.getLane(4)->signalGroupId = group1.id;
        network_.getLane(12)->signalGroupId = group1.id;
        network_.getLane(10)->signalGroupId = group1.id;
        network_.getLane(8)->signalGroupId = group2.id;
        network_.getLane(6)->signalGroupId = group2.id;
        controller_.addCarGroup(group1);
        controller_.addCarGroup(group2);
    }

    void removeVehicleById(int id) {
        auto it =
            std::remove_if(vehicles_.begin(), vehicles_.end(),
                           [id](const Vehicle& v) { return v.id() == id; });
        if (it != vehicles_.end()) {
            vehicles_.erase(it, vehicles_.end());
            syncVehicles();
            std::cout << "Vehicle " << id << " removed.\n";
        } else {
            std::cout << "Vehicle " << id << " not found.\n";
        }
    }

    void kill() {
        std::vector<int> idsToRemove;

        for (auto& v : vehicles_) {
            Lane* L = network_.getLane(v.laneId());
            if (!L)
                continue;
            if (v.route().plan().steps.empty())
                continue;

            if (v.laneId() == v.route().plan().steps.back().lane &&
                v.s() >= L->length()) {
                idsToRemove.push_back(v.id());
            }
        }

        for (int id : idsToRemove)
            removeVehicleById(id);
    }

    const RoadNetwork& network() const { return network_; }
    const std::vector<Vehicle>& vehicles() const { return vehicles_; }
    const WorldContext& world() const { return world_; }
    double time() const { return clock_.now; }

   private:
    RoadNetwork network_;
    SignalController controller_;
    SimulationClock clock_;
    std::vector<SimObject*> objects_;
    std::vector<Vehicle> vehicles_;
    std::vector<Vehicle*> vehicle_ptrs_;
    std::vector<SimObject*> object_ptrs_;
    std::vector<RouteTracker> routes_;
    WorldContext world_;
    Pathfinder pathfinder_;

    void syncVehicles() {
        vehicle_ptrs_.clear();
        object_ptrs_.clear();
        for (auto& v : vehicles_)
            vehicle_ptrs_.push_back(&v);
        for (auto& v : objects_)
            object_ptrs_.push_back(v);
    }
};

}  // namespace sim
