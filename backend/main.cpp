#include "core/simulation/simulation.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <atomic>
#include <string>

std::atomic<bool> running(true);
sim::Simulation simulation;
float last_spawn = 0;

void inputHandleLoop() {
    std::string line;
    while (running) {
        if (std::getline(std::cin, line)) {
            if (line == "exit") {
                running = false;
                break;
            }
        } else {
            running = false;
            break;
        }
    }
}

void simulationLoop() {
    const double target_dt = 0.01;
    const auto target_frame_time = std::chrono::duration<double>(target_dt);
    auto last_time = std::chrono::steady_clock::now();

    while (running) {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = now - last_time;

        if (elapsed >= target_frame_time) {
            double dt = std::chrono::duration<double>(elapsed).count();
            last_time = now;

            simulation.update(static_cast<float>(dt));

            if (std::abs(simulation.time() - last_spawn) > 2.0f) {
                simulation.addRandomVehicle();
                last_spawn = simulation.time();
            }

            for (const sim::Vehicle& veh : simulation.vehicles()) {
                sim::Pose vP = veh.pose();
                std::cout << "vh move " << veh.id() << " "
                    << vP.x << " " << vP.y << " " << vP.theta << std::endl;
            }
        } else {
            auto sleep_time = duration_cast<std::chrono::milliseconds>(
                target_frame_time - elapsed);
            if (sleep_time.count() > 0) {
                std::this_thread::sleep_for(sleep_time);
            }
        }
    }
}

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    simulation.initRoadNetwork();

    std::thread input_thread(inputHandleLoop);

    std::thread printer_thread(simulationLoop);

    input_thread.join();
    printer_thread.join();

    return 0;
}
