import * as readline from 'readline';
import { stdin as input, stdout as output } from 'process';

const dangerousPatterns = [
    /^rm\s+(-[^\s]*[rf][^\s]*\s+)?(\/|\.)/,
    /^sudo/,
    /^dd\s+/,
    /^mkfs/,
    /^chmod\s+(-R\s+)?777/,
    /^chown\s+(-R\s+)?/,
    /\b>\s*\/dev\/sd[a-z]/,
    /^:\(\)\{.*\|\:.*\&\}/, // fork bomb
];

export type ApprovalReason = 'always-ask' | 'model-requested' | 'dangerous-command';
export type ApprovalDecision = 'allow-once' | 'allow-session' | 'reject';

export function isDangerous(cmd: string): boolean {
    return dangerousPatterns.some(p => p.test(cmd.trim()));
}

const approvalOptions: Array<{ label: string; decision: ApprovalDecision }> = [
    { label: '1. Execute once', decision: 'allow-once' },
    { label: '2. Always execute this exact command for the current session', decision: 'allow-session' },
    { label: '3. Do not execute and stop the current task', decision: 'reject' },
];

function decisionFromChoice(choice: string): ApprovalDecision {
    if (!choice) return 'allow-once';
    if (choice === '1') return 'allow-once';
    if (choice === '2') return 'allow-session';
    return 'reject';
}

function renderApprovalOptions(selectedIndex: number) {
    output.write('Choose an action:\n');
    for (let index = 0; index < approvalOptions.length; index++) {
        const prefix = index === selectedIndex ? '\x1b[7m' : '';
        const suffix = index === selectedIndex ? '\x1b[0m' : '';
        output.write(`  ${prefix}${approvalOptions[index].label}${suffix}\n`);
    }
    output.write('Use ↑/↓ and Enter. Default: 1\n');
}

function clearRenderedOptions() {
    output.write('\x1b[5A');
    output.write('\x1b[J');
}

async function promptApprovalFallback(): Promise<ApprovalDecision> {
    const rl = readline.createInterface({
        input,
        output,
    });

    return new Promise((resolve) => {
        rl.question('> ', (answer: string) => {
            rl.close();
            resolve(decisionFromChoice(answer.trim()));
        });
    });
}

async function promptApprovalSelect(): Promise<ApprovalDecision> {
    if (!input.isTTY || !output.isTTY || !input.setRawMode) {
        return promptApprovalFallback();
    }

    let selectedIndex = 0;
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    renderApprovalOptions(selectedIndex);

    return new Promise((resolve) => {
        const finish = (decision: ApprovalDecision) => {
            input.setRawMode(false);
            input.off('keypress', onKeypress);
            output.write('\n');
            resolve(decision);
        };

        const onKeypress = (str: string, key: readline.Key) => {
            if (key.name === 'up') {
                selectedIndex = (selectedIndex + approvalOptions.length - 1) % approvalOptions.length;
                clearRenderedOptions();
                renderApprovalOptions(selectedIndex);
                return;
            }

            if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % approvalOptions.length;
                clearRenderedOptions();
                renderApprovalOptions(selectedIndex);
                return;
            }

            if (key.name === 'return') {
                finish(approvalOptions[selectedIndex].decision);
                return;
            }

            if (str === '1' || str === '2' || str === '3') {
                finish(decisionFromChoice(str));
                return;
            }

            if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
                finish('reject');
            }
        };

        input.on('keypress', onKeypress);
    });
}

export async function confirmExecution(cmd: string, reason: ApprovalReason): Promise<ApprovalDecision> {
    const labels: Record<ApprovalReason, string> = {
        'always-ask': 'Approval required by shell policy.',
        'model-requested': 'The model requested approval for this command.',
        'dangerous-command': 'Dangerous command detected.',
    };

    console.error(`\n${labels[reason]}`);
    console.error(cmd);
    return promptApprovalSelect();
}
