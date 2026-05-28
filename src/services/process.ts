import { spawn } from 'child_process';

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export function runCommand(command: string, args: string[], timeoutMs = 300000): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} exited with code ${code}: ${stderr || stdout}`));
    });
  });
}
