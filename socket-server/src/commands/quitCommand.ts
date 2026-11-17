const { getState, getAllSockets, shutdown } = require("../state/serverState");

export function execute() {
    console.log("[SERVER] Broadcasting shutdown message...");

    const state = getState();
    const sockets = getAllSockets();

    sockets.forEach((socket: { send(data: string): void; close(): void }) => {
        try {
            // Notify client
            socket.send(JSON.stringify({
                type: "SHUTDOWN",
                message: "Server is shutting down"
            }));

            // Give message time to send
            setTimeout(() => {
                try {
                    socket.close();
                } catch (err) {
                    console.log("[ERROR] Failed to close a client socket");
                }

            }, 100);

        } catch (err) {
            console.log("[ERROR] Failed to notify a client socket");
        }
    });

    // Clear system state
    shutdown();

    console.log("[SERVER] All connections closed.");
    console.log("[SERVER] Server shutting down...");

    state.sockets.clear();

    // Give sockets time to close gracefully
    setTimeout(() => {
        process.exit(0);
    }, 200);
}