#pragma once
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <queue>
#include <optional>
#include <functional>
#include "road_network.h"
#include "sim_math.h"

namespace sim {

struct Goal {
    enum class Type { LaneSet, LaneSingle, NodeReach };

    Type type{Type::LaneSet};
    std::unordered_set<LaneId> laneSet;
    LaneId laneSingle{-1};
    NodeId node{-1};

    static Goal toLane(LaneId lid) {
        Goal g;
        g.type = Type::LaneSingle;
        g.laneSingle = lid;
        return g;
    }

    static Goal toLaneSet(std::unordered_set<LaneId> s) {
        Goal g;
        g.type = Type::LaneSet;
        g.laneSet = std::move(s);
        return g;
    }

    static Goal toNode(NodeId n) {
        Goal g;
        g.type = Type::NodeReach;
        g.node = n;
        return g;
    }

    bool isSatisfied(LaneId atLane, const RoadNetwork& net) const;
};

struct RouteStep {
    LaneId lane;
    std::optional<LaneId> connectorFrom;
    std::optional<LaneId> connectorTo;
};

struct RoutePlan {
    std::vector<RouteStep> steps;
    int startIndex{0};  // индекс текущего шага
    [[nodiscard]] bool valid() const { return !steps.empty(); }
    [[nodiscard]] LaneId currentLane() const { return steps[startIndex].lane; }

    [[nodiscard]] std::optional<LaneId> nextConnector() const {
        for (int i = startIndex; i < (int)steps.size(); ++i) {
            if (steps[i].connectorFrom)
                return steps[i].lane;
        }
        return std::nullopt;
    }
};

class Pathfinder {
   public:
    explicit Pathfinder(const RoadNetwork* net) : net_(net) {}

    [[nodiscard]] RoutePlan plan(LaneId startLane, const Goal& goal) const;

    void setMaxSpeedForHeuristic(double vmax) { vmax_ = vmax; }

   private:
    const RoadNetwork* net_{nullptr};
    double vmax_{20.0};  // м/с для эвристики

    [[nodiscard]] double edgeCost(LaneId from, LaneId to) const;
    [[nodiscard]] double heuristic(LaneId lane, const Goal& goal) const;
};

struct EntryMovement {
    LaneId connector;  // id коннектора
    LaneId outLane;    // выходная полоса
};

class RouteTracker {
   public:
    explicit RouteTracker(const RoadNetwork* net) : net_(net) {}

    bool setGoalAndPlan(LaneId startLane, const Goal& goal,
                        const Pathfinder& pf);

    const RoutePlan& plan() const { return plan_; }

    std::optional<LaneId> nextConnector() const {
        return plan_.nextConnector();
    }

    void advanceIfEntered(LaneId lane);

    bool replanFrom(LaneId currentLane, const Pathfinder& pf);

    const Goal& goal() const { return goal_; }

   private:
    const RoadNetwork* net_;
    Goal goal_;
    RoutePlan plan_;
};

}  // namespace sim
