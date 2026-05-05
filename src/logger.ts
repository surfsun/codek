let verbose = false;

export function setVerbose(value: boolean) {
    verbose = value;
}

export function getVerbose() {
    return verbose;
}

function write(stream: NodeJS.WriteStream, label: string, msg: string) {
    stream.write(`[${label}] ${msg}\n`);
}

export const logger = {
    info(msg: string) {
        if (verbose) write(process.stderr, 'info', msg);
    },

    step(msg: string) {
        if (verbose) write(process.stderr, 'step', msg);
    },

    tool(msg: string) {
        if (verbose) write(process.stderr, 'tool', msg);
    },

    warn(msg: string) {
        write(process.stderr, 'warn', msg);
    },

    error(msg: string) {
        write(process.stderr, 'error', msg);
    },
};
