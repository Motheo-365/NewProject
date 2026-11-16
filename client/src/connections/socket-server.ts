// Use your deployed Render WebSocket endpoint
const SOCKET_SERVERS = [
    'wss://newproject-hymp.onrender.com',
] as const;

const CONNECTION_TIMEOUT_MS = 60_000;
const INITIAL_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

function connectToServer(url: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        let settled = false;

        const timeout = window.setTimeout(() => {
            fail(new Error(`Connection timed out: ${url}`));
        }, CONNECTION_TIMEOUT_MS);

        const cleanup = () => {
            window.clearTimeout(timeout);
            socket.removeEventListener('open', handleOpen);
            socket.removeEventListener('error', handleError);
            socket.removeEventListener('close', handleClose);
        };

        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            socket.close();
            reject(error);
        };

        const handleOpen = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(socket);
        };

        const handleError = () => fail(new Error(`Unable to connect: ${url}`));
        const handleClose = () => fail(new Error(`Connection closed before opening: ${url}`));

        socket.addEventListener('open', handleOpen, { once: true });
        socket.addEventListener('error', handleError, { once: true });
        socket.addEventListener('close', handleClose, { once: true });
    });
}

export async function connectToSocketServer(): Promise<WebSocket> {
    let retryDelay = INITIAL_RETRY_DELAY_MS;

    while (true) {
        const failures: string[] = [];

        for (const url of SOCKET_SERVERS) {
            try {
                return await connectToServer(url);
            } catch (error: unknown) {
                failures.push(error instanceof Error ? error.message : String(error));
            }
        }

        console.warn(
            `WebSocket server is unreachable; retrying in ${Math.round(retryDelay / 1000)} seconds.`,
            failures,
        );

        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, retryDelay);
        });
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
    }
}