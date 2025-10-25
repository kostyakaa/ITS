export class SimSocket {
    constructor(world) {
        this.world = world;
        this.socket = null;
        this.url = "wss://itsim.ru/ws";
    }

    connect() {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            console.log("[WS] Connected to", this.url);

            this.send({type: "create"});
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (err) {
                console.error("[WS] Invalid JSON from server:", event.data);
            }
        };

        this.socket.onclose = (e) => {
            console.warn(`[WS] Disconnected (${e.code}). Reconnecting in 3s...`);
            setTimeout(() => this.connect(), 3000);
        };

        this.socket.onerror = (err) => {
            console.error("[WS] WebSocket error:", err);
        };
    }

    send(obj) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(obj));
        } else {
            console.warn("[WS] Attempt to send while socket not open:", obj);
        }
    }

    handleMessage(data) {
        if (data.type !== "batch" || !Array.isArray(data.commands)) {
            console.warn("[WS] Unknown message format:", data);
            return;
        }

        for (const cmd of data.commands) {
            this.handleCommand(cmd);
        }
    }

    handleCommand(cmd) {
        const {type, action, id, meta} = cmd;

        if (type === "vh") {
            const carId = `car-${id}`;
            if (action === "move") {
                this.world.server.moveCar(carId, {
                    x: meta.x - 50,
                    y: meta.y - 50,
                    rot: meta.theta,
                });
            } else if (action === "deleted") {
                this.world.server.deleteCar(carId);
            } else if (action === "spawned") {
                this.world.server.createCar(carId);
            } else {
                console.log("[WS] Unhandled vehicle action:", action, cmd);
            }
        } else {
            console.log("[WS] Unsupported type:", type, cmd);
        }
    }
}
