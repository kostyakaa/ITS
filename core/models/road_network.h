#pragma once
#include <vector>
#include <unordered_map>
#include <string>
#include <optional>
#include "geometry.h"
#include "signals.h"

namespace sim {

using LaneId = int;
using NodeId = int;

struct Node {
    NodeId id{-1};
    Vec2 pos;
    std::string name;
};

class Lane {
public:
    LaneId id{-1};
    NodeId start{-1}, end{-1};
    double width{3.5};
    double speedLimit{13.9};
    bool isConnector{false};
    std::optional<LaneId> connectorFrom;
    std::optional<LaneId> connectorTo;
    std::optional<double> stopLineS;
    std::optional<int> signalGroupId;
    Polyline center;
    LaneId left{-1};
    LaneId right{-1};
    std::vector<LaneId> next;

    [[nodiscard]] double length() const { return center.length(); }

    [[nodiscard]] Pose poseAt(double s, double d = 0.0, double headingOffset = 0.0) const {
        return center.poseAt(s, d, headingOffset);
    }
};

struct RoadBuildResult {
    std::vector<LaneId> forward;
    std::vector<LaneId> backward;
    NodeId nodeA{-1}, nodeB{-1};
};

class RoadNetwork {
public:
    NodeId addNode(const Vec2& pos, std::string name = "");

    LaneId addLane(const std::vector<Vec2>& centerlinePts, NodeId start,
                   NodeId end,
                   double width = 3.5, double speedLimit = 13.9,
                   bool isConnector = false);

    // Автопостроение многополосной прямой дороги между узлами:
    // lanesEachDir >=1; offset рассчитывается от осевой линии
    RoadBuildResult addStraightRoad(const Vec2& A, const Vec2& B,
                                    int lanesEachDir, double laneWidth,
                                    double speedLimit);

    // Создать коннектор между полосами (например,поворот налево/направо/прямо через перекрёсток)
    // handleLen* управляют «радиусом» (длина опорных отрезков Безье)
    LaneId addConnector(LaneId inLane, LaneId outLane,
                        double handleLenIn, double handleLenOut,
                        int steps = 16);

    void setNeighbors(LaneId lane, std::optional<LaneId> left,
                      std::optional<LaneId> right);

    void setStopLine(LaneId lane, double sStop,
                     std::optional<int> carSignalGroupId);

    const Lane* getLane(LaneId id) const;
    Lane* getLane(LaneId id);
    const Node* getNode(NodeId id) const;

    const std::unordered_map<LaneId, Lane>& lanes() const { return lanes_; }
    const std::unordered_map<NodeId, Node>& nodes() const { return nodes_; }

    struct LaneRender {
        LaneId id;
        double width;
        bool isConnector;
        std::vector<Vec2> pts;
        std::optional<double> stopLineS;
        std::optional<int> signalGroupId;
    };

    std::vector<LaneRender> exportLanesForRender() const;

private:
    NodeId nextNodeId_{1};
    LaneId nextLaneId_{1};
    std::unordered_map<NodeId, Node> nodes_;
    std::unordered_map<LaneId, Lane> lanes_;
};

} // namespace sim
