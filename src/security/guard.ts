import { CommandApprovalDecision, confirmCommandApproval } from '../terminal/ui.js';

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
export type ApprovalDecision = CommandApprovalDecision;

export function isDangerous(cmd: string): boolean {
    return dangerousPatterns.some(p => p.test(cmd.trim()));
}

export async function confirmExecution(cmd: string, reason: ApprovalReason, cwd: string): Promise<ApprovalDecision> {
    const labels: Record<ApprovalReason, string> = {
        'always-ask': 'shell approval mode is ask',
        'model-requested': 'the model marked this command as requiring approval',
        'dangerous-command': 'dangerous command pattern detected',
    };

    return confirmCommandApproval({
        command: cmd,
        cwd,
        reason: labels[reason],
    });
}
