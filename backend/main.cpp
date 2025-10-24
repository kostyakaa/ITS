#include <iostream>
#include <thread>
#include <chrono>
#include <atomic>
#include <string>

int main() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    std::atomic<bool> running(true);

    std::thread input_thread([&]() {
        std::string line;
        while (running) {
            if (std::getline(std::cin, line)) {
                if (line == "exit") {
                    running = false;
                    break;
                } else {
                    std::cout << "Вы ввели: " << line << std::endl;
                }
            } else {
                running = false;
                break;
            }
        }
    });

    std::thread printer_thread([&]() {
        while (running) {
            std::cout << "[printer] meow 2" << std::endl;
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
        }
    });

    input_thread.join();
    printer_thread.join();

    return 0;
}