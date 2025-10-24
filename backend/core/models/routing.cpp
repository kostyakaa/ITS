#include "routing.h"
#include <limits>
#include <cmath>
#include <queue>

namespace sim {

bool Goal::isSatisfied(LaneId atLane, const RoadNetwork& net) const {
    switch (type) {
        case Type::LaneSingle:
            return atLane == laneSingle;
        case Type::LaneSet:
            return laneSet.count(atLane) > 0;
        case Type::NodeReach: {
            const Lane* L = net.getLane(atLane);
            return (L && L->end == node);
        }
    }
    return false;
}

struct NodeRec {
    LaneId lane;
    double g;       // накопленная стоимость
    double f;       // g + h
    LaneId parent;  // предок
    bool operator<(const NodeRec& o) const { return f > o.f; }
};

RoutePlan Pathfinder::plan(LaneId startLane, const Goal& goal) const {
    RoutePlan out;

    std::unordered_map<LaneId, double> bestG;
    std::unordered_map<LaneId, LaneId> parent;
    std::priority_queue<NodeRec> pq;

    double h0 = heuristic(startLane, goal);
    pq.push({startLane, 0.0, h0, -1});
    bestG[startLane] = 0.0;

    auto reconstruct = [&](LaneId goalLane) {
        std::vector<LaneId> lanes;
        LaneId cur = goalLane;
        while (cur != -1) {
            lanes.push_back(cur);
            auto it = parent.find(cur);
            cur = (it == parent.end()) ? -1 : it->second;
        }
        std::reverse(lanes.begin(), lanes.end());
        out.steps.clear();
        out.startIndex = 0;
        out.steps.reserve(lanes.size());
        for (auto lid : lanes) {
            const Lane* L = net_->getLane(lid);
            RouteStep st;
            st.lane = lid;
            if (L && L->isConnector) {
                st.connectorFrom = L->connectorFrom;
                st.connectorTo = L->connectorTo;
            }
            out.steps.push_back(st);
        }
        return out;
    };

    while (!pq.empty()) {
        NodeRec cur = pq.top();
        pq.pop();

        if (goal.isSatisfied(cur.lane, *net_)) {
            return reconstruct(cur.lane);
        }

        const Lane* L = net_->getLane(cur.lane);
        if (!L)
            continue;

        for (LaneId nxt : L->next) {
            const Lane* LN = net_->getLane(nxt);
            if (!LN)
                continue;
            double w = edgeCost(cur.lane, nxt);
            double gNew = cur.g + w;
            if (!bestG.count(nxt) || gNew < bestG[nxt]) {
                bestG[nxt] = gNew;
                parent[nxt] = cur.lane;
                double f = gNew + heuristic(nxt, goal);
                pq.push({nxt, gNew, f, cur.lane});
            }
        }
        if (L->left != -1) {
            const Lane* LN = net_->getLane(L->left);
            if (!LN)
                continue;
            double w = edgeCost(cur.lane, L->left);
            double gNew = cur.g + w;
            if (!bestG.count(L->left) || gNew < bestG[L->left]) {
                bestG[L->left] = gNew;
                parent[L->left] = cur.lane;
                double f = gNew + heuristic(L->left, goal);
                pq.push({L->left, gNew, f, cur.lane});
            }
        }
        if (L->right != -1) {
            const Lane* LN = net_->getLane(L->right);
            if (!LN)
                continue;
            double w = edgeCost(cur.lane, L->right);
            double gNew = cur.g + w;
            if (!bestG.count(L->right) || gNew < bestG[L->right]) {
                bestG[L->right] = gNew;
                parent[L->right] = cur.lane;
                double f = gNew + heuristic(L->right, goal);
                pq.push({L->right, gNew, f, cur.lane});
            }
        }
    }

    return out;
}

double Pathfinder::edgeCost(LaneId from, LaneId to) const {
    const Lane* L = net_->getLane(to);
    const Lane* L2 = net_->getLane(from);
    if (!L2 || !L)
        return 1e9;
    if (L->left == L2->id || L->right == L2->id) {
        return L->width / 3;
    }
    double base = std::max(1e-6, L->length() / std::max(1.0, L->speedLimit));
    if (L->isConnector)
        base *= 1.1;
    return base;
}

double Pathfinder::heuristic(LaneId lane, const Goal& goal) const {
    const Lane* L = net_->getLane(lane);
    if (!L)
        return 0.0;
    Vec2 p = net_->getNode(L->end)->pos;

    switch (goal.type) {
        case Goal::Type::LaneSingle: {
            const Lane* G = net_->getLane(goal.laneSingle);
            if (!G)
                return 0.0;
            Vec2 g = net_->getNode(G->end)->pos;
            return norm(g - p) / std::max(1.0, vmax_);
        }
        case Goal::Type::LaneSet: {
            double best = 0.0;
            bool init = false;
            for (auto lid : goal.laneSet) {
                const Lane* G = net_->getLane(lid);
                if (!G)
                    continue;
                Vec2 g = net_->getNode(G->end)->pos;
                double d = norm(g - p) / std::max(1.0, vmax_);
                if (!init || d < best) {
                    best = d;
                    init = true;
                }
            }
            return init ? best : 0.0;
        }
        case Goal::Type::NodeReach: {
            Vec2 g = net_->getNode(goal.node)->pos;
            return norm(g - p) / std::max(1.0, vmax_);
        }
    }
    return 0.0;
}

bool RouteTracker::setGoalAndPlan(LaneId startLane, const Goal& goal,
                                  const Pathfinder& pf) {
    goal_ = goal;
    plan_ = pf.plan(startLane, goal_);
    return plan_.valid();
}

void RouteTracker::advanceIfEntered(LaneId lane) {
    if (plan_.startIndex < (int)plan_.steps.size() &&
        plan_.steps[plan_.startIndex].lane == lane) {
        plan_.startIndex++;
        while (plan_.startIndex < (int)plan_.steps.size() &&
               plan_.steps[plan_.startIndex].lane == lane) {
            plan_.startIndex++;
        }
    }
}

bool RouteTracker::replanFrom(LaneId currentLane, const Pathfinder& pf) {
    plan_ = pf.plan(currentLane, goal_);
    return plan_.valid();
}

}  // namespace sim
