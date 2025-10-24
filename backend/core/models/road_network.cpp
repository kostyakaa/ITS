#include "road_network.h"
#include <cassert>

namespace sim {

NodeId RoadNetwork::addNode(const Vec2& pos, std::string name) {
    Node n;
    n.id = nextNodeId_++;
    n.pos = pos;
    n.name = std::move(name);
    nodes_[n.id] = n;
    return n.id;
}

LaneId RoadNetwork::addLane(const std::vector<Vec2>& centerlinePts,
                            NodeId start, NodeId end,
                            double width, double speedLimit, bool isConnector) {
    assert(nodes_.count(start) && nodes_.count(end));
    Lane l;
    l.id = nextLaneId_++;
    l.start = start;
    l.end = end;
    l.width = width;
    l.speedLimit = speedLimit;
    l.isConnector = isConnector;
    l.center.setPoints(centerlinePts);
    lanes_[l.id] = std::move(l);
    return l.id;
}

RoadBuildResult RoadNetwork::addStraightRoad(const Vec2& A, const Vec2& B,
                                             int lanesEachDir, double laneWidth,
                                             double speedLimit) {
    RoadBuildResult res;
    res.nodeA = addNode(A);
    res.nodeB = addNode(B);

    std::vector<Vec2> axis = {A, B};

    for (int i = 0; i < lanesEachDir; i++) {
        double off = (0.5 + i) * laneWidth;

        auto ptsF = offsetPolyline(axis, -off);
        LaneId lf = addLane(ptsF, res.nodeA, res.nodeB, laneWidth, speedLimit, false);
        res.forward.push_back(lf);

        auto ptsB = offsetPolyline(axis, +off);
        std::vector<Vec2> ptsBdir = {ptsB[1], ptsB[0]};
        LaneId lb = addLane(ptsBdir, res.nodeB, res.nodeA, laneWidth, speedLimit, false);
        res.backward.push_back(lb);
    }

    for (int i = 0; i < lanesEachDir; i++) {
        LaneId lf = res.forward[i];
        LaneId lb = res.backward[i];

        lanes_[lf].left = (i + 1 < lanesEachDir) ? res.forward[i + 1] : -1;
        lanes_[lf].right = (i > 0) ? res.forward[i - 1] : -1;

        lanes_[lb].left = (i + 1 < lanesEachDir) ? res.backward[i + 1] : -1;
        lanes_[lb].right = (i > 0) ? res.backward[i - 1] : -1;
    }

    for (auto lid : res.forward) {
        double stopS = std::max(0.0, lanes_[lid].length() - 2.890);
        lanes_[lid].stopLineS = stopS;
    }
    for (auto lid : res.backward) {
        double stopS = std::max(0.0, lanes_[lid].length() - 2.890);
        lanes_[lid].stopLineS = stopS;
    }

    return res;
}

LaneId RoadNetwork::addConnector(LaneId inLane, LaneId outLane,
                                 double handleLenIn, double handleLenOut,
                                 int steps) {
    assert(lanes_.count(inLane) && lanes_.count(outLane));
    const Lane& L_in = lanes_.at(inLane);
    const Lane& L_out = lanes_.at(outLane);

    double sIn = L_in.length();
    auto [pIn,tIn] = L_in.center.sample(sIn);
    auto [pInPrev,tInPrev] = L_in.center.sample(std::max(0.0, sIn - 0.5));
    tIn = normalized(pIn - pInPrev);

    auto [pOut0,tOut0] = L_out.center.sample(0.0);
    auto [pOut1,tOut1] = L_out.center.sample(std::min(0.5, L_out.length()));
    tOut0 = normalized(tOut1);

    auto pts = bezierConnector(pIn, tIn, pOut0, tOut0, handleLenIn,
                               handleLenOut, steps);
    LaneId conn = addLane(pts, L_in.end, L_out.start, L_in.width,
                          std::min(L_in.speedLimit, L_out.speedLimit), true);

    lanes_[inLane].next.push_back(conn);
    lanes_[conn].next.push_back(outLane);
    lanes_[conn].connectorFrom = inLane;
    lanes_[conn].connectorTo = outLane;

    return conn;
}

void RoadNetwork::setNeighbors(LaneId lane, std::optional<LaneId> left,
                               std::optional<LaneId> right) {
    assert(lanes_.count(lane));
    lanes_[lane].left = left.value_or(-1);
    lanes_[lane].right = right.value_or(-1);
}

void RoadNetwork::setStopLine(LaneId lane, double sStop,
                              std::optional<int> carSignalGroupId) {
    assert(lanes_.count(lane));
    lanes_[lane].stopLineS = sStop;
    if (carSignalGroupId)
        lanes_[lane].signalGroupId = carSignalGroupId;
}

const Lane* RoadNetwork::getLane(LaneId id) const {
    auto it = lanes_.find(id);
    return it == lanes_.end() ? nullptr : &it->second;
}

Lane* RoadNetwork::getLane(LaneId id) {
    auto it = lanes_.find(id);
    return it == lanes_.end() ? nullptr : &it->second;
}

const Node* RoadNetwork::getNode(NodeId id) const {
    auto it = nodes_.find(id);
    return it == nodes_.end() ? nullptr : &it->second;
}

std::vector<RoadNetwork::LaneRender> RoadNetwork::exportLanesForRender() const {
    std::vector<LaneRender> out;
    out.reserve(lanes_.size());
    for (const auto& kv : lanes_) {
        const Lane& l = kv.second;
        out.push_back(LaneRender{
            l.id, l.width, l.isConnector, l.center.points(), l.stopLineS,
            l.signalGroupId
        });
    }
    return out;
}

} // namespace sim
