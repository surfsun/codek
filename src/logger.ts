export const logger = {
    info(msg: string) {
        console.log(`🟦 [INFO] ${msg}`);
    },

    step(msg: string) {
        console.log(`🟨 [STEP] ${msg}`);
    },

    tool(msg: string) {
        console.log(`🟩 [TOOL] ${msg}`);
    },

    warn(msg: string) {
        console.log(`🟧 [WARN] ${msg}`);
    },

    error(msg: string) {
        console.log(`🟥 [ERROR] ${msg}`);
    },
};