/* 
    Receive username
    Ask connectionMager for socejt
    Check if user exists
    Notify user
    Close socket
    Remove connection
    Print success/error
*/

const { getSockets, removeUser } = require("../state/serverState");

export function execute(args: string) {
    const username = args[0];

    // Validate input
    if (!username) {
        console.log("[ERROR] Missing username");
        return;
    }

    console.log(`[KILL COMMAND] Attempting to disconnect user: ${username}`);

    // Get the user’s socket
    const sockets = getSockets(username);

    if (sockets.length === 0) {
        console.log(`[ERROR] User ${username} not found or not connected`);
        return;
    }

    for (const socket of sockets) {
        try {
            socket.send(JSON.stringify({
                type: "KILLED",
                message: "You have been disconnected by the server"
            }));
            socket.close();
        } catch {
            console.log(`[ERROR] Failed to disconnect a session for ${username}`);
        }
    }

    removeUser(username);
    console.log(`[SUCCESS] User ${username} disconnected`);
}