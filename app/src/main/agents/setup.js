// Connecting an assistant with one press (M10-27, first part of M10-09). The chat's card for an assistant that is
// not installed or not signed in used to say "open PowerShell, paste this line"; most people who make videos have
// never opened PowerShell. "Open PowerShell for me" opens a window the person can watch, already running that
// assistant's own installer and sign-in, and the person presses "Check again" in the app when it is done.
//
// Only the commands each bridge lists in `about.install` and `about.signIn` are ever run, chosen here by the
// assistant's id and the step; nothing the page sends becomes part of the command. The window is the person's to
// read and close: sign-in needs their browser and their answers.
import { spawn } from "node:child_process";

export const STEPS = ["install", "signIn"];

// After an installer, the tool's folder is on the user's PATH in the registry but not yet in this window.
const REFRESH_PATH =
  "$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + " +
  "[Environment]::GetEnvironmentVariable('Path','Machine')";

/** The PowerShell script for `step` from a bridge's `about`, or null when there is nothing to run. */
export function setupScript(about, step) {
  const install = about?.install ?? [];
  const signIn = about?.signIn ?? [];
  const lines = step === "install" ? [...install, ...(install.length && signIn.length ? [REFRESH_PATH] : []), ...signIn]
    : step === "signIn" ? signIn : [];
  return lines.length ? lines.join("; ") : null;
}

/**
 * Open a visible PowerShell window running `script`. A hidden PowerShell asks Windows for a normal window with
 * Start-Process, and hands it the script base64-encoded (-EncodedCommand), so no quote in it can break out. Tried on
 * 2026-10-25: Node's `detached: true` starts PowerShell with no console at all (nothing shows, nothing runs), and
 * `cmd /c start` from a hidden cmd ran the script in a window nobody could see.
 */
export function openSetupWindow(script, { spawnImpl = spawn } = {}) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const child = spawnImpl("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    `Start-Process -FilePath powershell.exe -WindowStyle Normal -ArgumentList '-NoExit','-EncodedCommand','${encoded}'`,
  ], { stdio: "ignore", windowsHide: true });
  child.on?.("error", () => {});
  child.unref?.();
}
