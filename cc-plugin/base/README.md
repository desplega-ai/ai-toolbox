# Agentic Coding 101 with Claude Code

> A Claude Code plugin markteplace to help you start applying effective agentic coding patterns in your projects.

## Motivation

Agentic coding with Claude Code might seem "trivial" at first, as by just writing a prompt it seems that it all "just works". But in reality is not that simple... let me try to explain why.

### Problem 1: Writing Prompts

Writing good prompts is hard, but it's the first step to get good results, specially at scale or in non-greenfield projects. What you pass to the LLM matters a lot as it will steer the conversation, it's has a butterfly effect.

The set of plugins offered here aim to help reducing the effect of a bad prompt, by providing ways to iterate, breakdown and reduce the compounding effect of a bad prompt by splitting the development process in smaller steps.

### Problem 2: Context management

On the other hand, leaving CC running for long periods of times yield to high context usage, unwanted compactifications and overall needle in a haystack situations. For that, the process mentioned above in which we break down the development in smaller steps helps a lot to control that.

Also, as a general rule, _emprical research_ has shown that having context usage above 40% tends to yield bad results by default (see DEX videos below for more details).

Here's an [article that I wrote regarding context engineering](https://www.tarasyarema.com/blog/agent-context-engineering).

### Problem 3: Human in the loop

Finally, some of the keys of the proposed agentic coding patterns described in these plugins are to forcefully insert human in the loop at key points of the development process. 

This is important, as some of the patterns described here go "against" one-shotting your solutions, but rather do an iterative "gradien descent" approach to get to the desired solution.

## How does it work?

### Installation

From inside Claude Code, run:

```bash
/plugin marketplace add desplega-ai/ai-toolbox
```

or from the terminal

```bash
claude plugin marketplace add desplega-ai/ai-toolbox
```

Then install the plugin inside it with:

```bash
/plugin install desplega@desplega-ai-toolbox
```

### What's inside?

Inside you will find:

- [commands](./commands) - Entrypoint commands, the important part
- [agents](./agents) - Sub-agents to be used by the commands
- [skills](./skills)

#### Commands

The basic commands provided are:

1. `research`
2. `create-plan`
3. `implement-plan`

## Inspiration

Highly inspired on [Humanlayer](https://www.humanlayer.dev/) and it's github repository [`humanlayer/humanlayer`](https://github.com/humanlayer/humanlayer). Highly recommend checking it out!

Also, some of the videos from DEX, here are some good ones to start with:

- [Advanced Context Engineering for Agents](https://www.youtube.com/watch?v=IS_y40zY-hc)
- [12-Factor Agents: Patterns of reliable LLM applications — Dex Horthy, HumanLayer](https://www.youtube.com/watch?v=8kMaTybvDUw)

Also you should check the [12 factor agents](https://github.com/humanlayer/12-factor-agents) repository.

## License

MIT, some commands Apache 2.0 (check each file for details).
