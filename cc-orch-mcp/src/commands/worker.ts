import { mkdir } from "node:fs/promises";

export interface WorkerOptions {
  prompt?: string;
  yolo?: boolean;
  additionalArgs?: string[];
}

interface RunClaudeIterationOptions {
  prompt: string;
  logFile: string;
  additionalArgs?: string[];
}

async function runClaudeIteration(opts: RunClaudeIterationOptions): Promise<number> {
  const CMD = [
    "claude",
    "--verbose",
    "--output-format",
    "stream-json",
    "--dangerously-skip-permissions",
    "--allow-dangerously-skip-permissions",
    "--permission-mode",
    "bypassPermissions",
    "-p",
    opts.prompt,
  ];

  if (opts.additionalArgs && opts.additionalArgs.length > 0) {
    CMD.push(...opts.additionalArgs);
  }

  console.log(`[worker] Running: claude ... -p "${opts.prompt}"`);

  const logFileHandle = Bun.file(opts.logFile).writer();

  // Collect stderr for better error reporting
  let stderrOutput = "";

  const proc = Bun.spawn(CMD, {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });

  console.log(`[worker] Process spawned, PID: ${proc.pid}`);
  console.log(`[worker] Waiting for output streams...`);

  let stdoutChunks = 0;
  let stderrChunks = 0;

  // Read stdout and stderr concurrently
  const stdoutPromise = (async () => {
    console.log(`[worker] stdout stream: ${proc.stdout ? "available" : "not available"}`);
    if (proc.stdout) {
      for await (const chunk of proc.stdout) {
        stdoutChunks++;
        const text = new TextDecoder().decode(chunk);
        logFileHandle.write(text);
        console.log(`[worker] stdout chunk #${stdoutChunks} (${chunk.length} bytes)`);

        // Also parse and log to console for visibility
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.trim() === "") continue;
          try {
            const json = JSON.parse(line.trim());
            // Log a summary of what's happening
            if (json.type === "assistant" && json.message) {
              const preview = json.message.slice(0, 100);
              console.log(`[worker] Assistant: ${preview}${json.message.length > 100 ? "..." : ""}`);
            } else if (json.type === "tool_use") {
              console.log(`[worker] Tool: ${json.tool || json.name || "unknown"}`);
            } else if (json.type === "result") {
              // Log result details
              const resultPreview = JSON.stringify(json).slice(0, 200);
              console.log(`[worker] Result: ${resultPreview}${JSON.stringify(json).length > 200 ? "..." : ""}`);
            } else if (json.type === "error") {
              console.error(`[worker] Error from Claude: ${json.error || json.message || JSON.stringify(json)}`);
            } else if (json.type === "system") {
              // Log system message details
              const msg = json.message || json.content || "";
              const preview = typeof msg === "string" ? msg.slice(0, 150) : JSON.stringify(msg).slice(0, 150);
              console.log(`[worker] System: ${preview}${preview.length >= 150 ? "..." : ""}`);
            } else {
              // Log unknown event types with content
              console.log(`[worker] Event type: ${json.type} - ${JSON.stringify(json).slice(0, 100)}`);
            }
          } catch {
            // Non-JSON line, just log it
            if (line.trim()) {
              console.log(`[worker] Raw output: ${line.trim()}`);
            }
          }
        }
      }
      console.log(`[worker] stdout stream ended (total ${stdoutChunks} chunks)`);
    }
  })();

  const stderrPromise = (async () => {
    console.log(`[worker] stderr stream: ${proc.stderr ? "available" : "not available"}`);
    if (proc.stderr) {
      for await (const chunk of proc.stderr) {
        stderrChunks++;
        const text = new TextDecoder().decode(chunk);
        stderrOutput += text;
        // Log stderr to console immediately
        console.error(`[worker] stderr chunk #${stderrChunks}: ${text.trim()}`);
        logFileHandle.write(
          JSON.stringify({ type: "stderr", content: text, timestamp: new Date().toISOString() }) +
          "\n",
        );
      }
      console.log(`[worker] stderr stream ended (total ${stderrChunks} chunks)`);
    }
  })();

  // Wait for both streams to finish
  console.log(`[worker] Waiting for streams to complete...`);
  await Promise.all([stdoutPromise, stderrPromise]);

  await logFileHandle.end();
  console.log(`[worker] Waiting for process to exit...`);
  const exitCode = await proc.exited;

  // Log final status
  console.log(`[worker] Claude exited with code ${exitCode}`);
  console.log(`[worker] Total stdout chunks: ${stdoutChunks}, stderr chunks: ${stderrChunks}`);

  if (exitCode !== 0 && stderrOutput) {
    console.error(`[worker] Full stderr output:\n${stderrOutput}`);
  }

  if (stdoutChunks === 0 && stderrChunks === 0) {
    console.warn(`[worker] WARNING: No output received from Claude at all!`);
    console.warn(`[worker] This might indicate Claude failed to start or auth issues.`);
  }

  return exitCode ?? 1;
}

export async function runWorker(opts: WorkerOptions) {
  const sessionId = process.env.SESSION_ID || crypto.randomUUID().slice(0, 8);
  // WORKER_LOG_DIR env var for Docker, otherwise ./logs
  const baseLogDir = process.env.WORKER_LOG_DIR || "./logs";
  const logDir = `${baseLogDir}/${sessionId}`;

  // Create log directory
  await mkdir(logDir, { recursive: true });

  const defaultPrompt =
    "/start-worker Start or continue the tasks your leader assigned you!";
  const prompt = opts.prompt || defaultPrompt;

  const isYolo = opts.yolo || process.env.WORKER_YOLO === "true";

  console.log(`[worker] Starting worker`);
  console.log(`[worker] Session ID: ${sessionId}`);
  console.log(`[worker] Log directory: ${logDir}`);
  console.log(`[worker] YOLO mode: ${isYolo ? "enabled" : "disabled"}`);
  console.log(`[worker] Prompt: ${prompt}`);

  let iteration = 0;

  while (true) {
    iteration++;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logFile = `${logDir}/${timestamp}.jsonl`;

    console.log(`\n[worker] === Iteration ${iteration} ===`);
    console.log(`[worker] Logging to: ${logFile}`);

    // Write iteration metadata at the start of each log file
    const metadata = {
      type: "worker_metadata",
      sessionId,
      iteration,
      timestamp: new Date().toISOString(),
      prompt,
      yolo: isYolo,
    };
    await Bun.write(logFile, JSON.stringify(metadata) + "\n");

    const exitCode = await runClaudeIteration({
      prompt,
      logFile,
      additionalArgs: opts.additionalArgs,
    });

    if (exitCode !== 0) {
      const errorLog = {
        timestamp: new Date().toISOString(),
        iteration,
        exitCode,
        error: true,
      };

      // Append to errors.jsonl
      const errorsFile = `${logDir}/errors.jsonl`;
      const existingErrors = (await Bun.file(errorsFile).exists())
        ? await Bun.file(errorsFile).text()
        : "";
      await Bun.write(errorsFile, existingErrors + JSON.stringify(errorLog) + "\n");

      if (!isYolo) {
        console.error(`[worker] Claude exited with code ${exitCode}. Stopping.`);
        console.error(`[worker] Error logged to: ${errorsFile}`);
        process.exit(exitCode);
      }

      console.warn(`[worker] Claude exited with code ${exitCode}. YOLO mode - continuing...`);
    }

    console.log(`[worker] Iteration ${iteration} complete. Starting next iteration...`);
  }
}
