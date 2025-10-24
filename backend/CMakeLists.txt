cmake_minimum_required(VERSION 3.22)
project(ITS)

set(CMAKE_CXX_STANDARD 20)

add_executable(ITS main.cpp
        core/models/sim_math.h
        core/models/geometry.cpp
        core/models/geometry.h
        core/models/signals.cpp
        core/models/signals.h
        core/models/road_network.cpp
        core/models/road_network.h
        core/models/routing.cpp
        core/models/routing.h
        core/models/sim_object.h
        core/models/world_context.h
        core/models/traffic_light_entity.h
        core/models/vehicle.cpp
        core/models/vehicle.h
        core/models/world_context.cpp
        core/simulation/simulation.cpp
        core/simulation/simulation.h
)