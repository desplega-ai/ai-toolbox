import { Command } from "commander";

const SHELL_FUNCTION = `wts() {
  if [[ "$1" == "switch" || "$1" == "cd" ]]; then
    local output
    output=$(WTS_SHELL_WRAP=1 command wts "$@")
    local exit_code=$?
    if [[ $exit_code -eq 0 ]] && [[ -n "$output" ]]; then
      builtin cd "$output" || return 1
    fi
    return $exit_code
  else
    command wts "$@"
  fi
}`;

export const shellInitCommand = new Command("shell-init")
  .description("Output shell function for cd integration (add to ~/.zshrc)")
  .action(() => {
    console.log(SHELL_FUNCTION);
  });
