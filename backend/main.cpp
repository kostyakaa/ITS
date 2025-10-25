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
    while (running) {
        simulation.update(0.02);
        if (abs(simulation.time() - last_spawn) > 3) {
            simulation.addRandomVehicle();
            last_spawn = simulation.time();
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
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
