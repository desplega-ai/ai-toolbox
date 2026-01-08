import * as readline from "node:readline";

/**
 * Prompt for text input
 */
export async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const suffix = defaultValue ? ` (${defaultValue})` : "";

  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

/**
 * Prompt for yes/no confirmation
 */
export async function confirm(question: string, defaultValue = false): Promise<boolean> {
  const hint = defaultValue ? "[Y/n]" : "[y/N]";
  const answer = await prompt(`${question} ${hint}`, "");

  if (!answer) {
    return defaultValue;
  }

  return answer.toLowerCase().startsWith("y");
}

/**
 * Prompt for selection from options
 */
export async function select<T extends string>(
  question: string,
  options: { value: T; label: string }[],
  defaultValue?: T,
): Promise<T> {
  console.log(question);
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    if (!opt) continue;
    const marker = opt.value === defaultValue ? "*" : " ";
    console.log(`  ${marker}${i + 1}. ${opt.label}`);
  }

  const answer = await prompt("Enter number", defaultValue ? undefined : "1");

  const index = parseInt(answer, 10) - 1;
  const selected = options[index];
  if (selected) {
    return selected.value;
  }

  // Try to match by value
  const match = options.find((o) => o.value === answer);
  if (match) {
    return match.value;
  }

  const first = options[0];
  return defaultValue ?? (first?.value as T);
}
