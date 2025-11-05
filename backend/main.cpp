#include "core/simulation/simulation.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <atomic>
#include <string>
#include <sstream>
#include <cmath>

using clock_tt = std::chrono::steady_clock;
using seconds_d = std::chrono::duration<double>;

std::atomic<bool> running{true};
std::atomic<bool> paused{false};
std::atomic<double> time_scale{1.0};

sim::Simulation simulation;
double last_spawn = 0.0f;
double last_time_print = 0.0f;


void inputHandleLoop() {
    std::string line;
    while (running) {
        if (std::getline(std::cin, line)) {
            if (line == "exit") {
                running = false;
                break;
            }
            if (line == "reset") {
                simulation.reset();
            } else if (line == "pause") {
                paused = true;
            } else if (line == "resume") {
                paused = false;
            } else if (line == "toggle") {
                paused = !paused.load();
            } else if (line.rfind("speed", 0) == 0) {
                std::istringstream iss(line);
                std::string cmd;
                double k;
                if (iss >> cmd >> k) {
                    if (k < 0.0) {
                        k = 0.0;
                    }
                    if (k > 100.0) {
                        k = 100.0;
                    }
                    time_scale = k;
                }
            }
        }
    }
}

void simulationLoop() {
    const double target_dt = 1.0 / 60.0;
    const seconds_d target_frame_time(target_dt);

    auto last_time = clock_tt::now();
    seconds_d acc{0.0};

    const double max_sim_step = 0.05;

    while (running) {
        auto now = clock_tt::now();
        auto elapsed = now - last_time;
        last_time = now;
        acc += std::chrono::duration_cast<seconds_d>(elapsed);

        while (acc >= target_frame_time && running) {
            acc -= target_frame_time;

            double sim_dt = paused ? 0.0 : (target_dt * time_scale.load());

            if (sim_dt == 0.0)
                continue;

            if (sim_dt > max_sim_step)
                sim_dt = max_sim_step;

            simulation.update(static_cast<float>(sim_dt));

            if (std::abs(simulation.time() - last_spawn) > 1.5f) {
                simulation.addRandomVehicle();
                last_spawn = simulation.time();
            }

            for (const sim::Vehicle& veh : simulation.vehicles()) {
                sim::Pose vP = veh.pose();
                std::cout << "vh move " << veh.id() << " "
                    << vP.x << " " << vP.y << " " << vP.theta << ";";
            }
            if (!simulation.vehicles().empty()) {
                std::cout << std::endl;
            }
            if (simulation.time() - last_time_print >= 1.0f) {
                std::cout << "time " << simulation.time() << ";";

                sim::CarSignal s2 = simulation.world().carSignalForLane(2);
                sim::CarSignal s6 = simulation.world().carSignalForLane(6);

                std::cout << "signal 0 " << static_cast<int>(s2)
                    << ";signal 1 " << static_cast<int>(s6) <<
                    std::endl;

                last_time_print = simulation.time();
            }

        }

        auto frame_left = target_frame_time - acc;
        if (frame_left.count() > 0) {
            auto sleep_ms = std::chrono::duration_cast<
                std::chrono::milliseconds>(frame_left);
            if (sleep_ms.count() > 0) {
                std::this_thread::sleep_for(sleep_ms);
            }
        }
    }
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    simulation.initRoadNetwork();

    std::thread input_thread(inputHandleLoop);
    std::thread sim_thread(simulationLoop);

    input_thread.join();
    sim_thread.join();

    return 0;
}
