import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

export async function askQuestion(
  question: string,
  options: Array<{ label: string; description?: string }>,
  multiSelect: boolean,
): Promise<string> {
  output.write(`\n${question}\n`);
  for (let i = 0; i < options.length; i++) {
    output.write(`  ${i + 1}. ${options[i].label}`);
    if (options[i].description) {
      output.write(` — ${options[i].description}`);
    }
    output.write('\n');
  }

  const prompt = multiSelect ? '\nEnter numbers (comma-separated): ' : '\nEnter number: ';
  output.write(prompt);

  const rl = createInterface({ input, output });
  const answer = await rl.question('');
  rl.close();

  const selected = answer
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));

  const chosen = selected.map(i => options[i - 1]?.label).filter(Boolean);
  if (chosen.length === 0) return options[0]?.label || 'canceled';

  return multiSelect ? chosen.join(', ') : chosen[0];
}
