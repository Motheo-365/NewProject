//Reads input ()
const { parseCommand } = require("./commandParser");
const { routeCommand } = require("./commandRouter");

export function handleCommand(input: string) {
    console.log(`[INPUT] ${input}`);

    const commandObj = parseCommand(input);

    if (!commandObj) {
        console.log("[ERROR] Invalid command format");
        return;
    }

    console.log("[PARSED]", commandObj);

    routeCommand(commandObj);
}