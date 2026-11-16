"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCommand = parseCommand;
//COnvert text into structured command
function parseCommand(input) {
    const parts = input.split(" ");
    const command = parts[0];
    const args = parts.slice(1);
    if (!command)
        return null;
    return {
        command,
        args,
    };
}
