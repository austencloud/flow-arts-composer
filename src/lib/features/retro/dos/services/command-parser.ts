/**
 * CommandParser -- DOS command interpreter for TKAUTIL.COM
 *
 * Handles all built-in DOS commands: DIR, DIR /SEQ, TYPE, CD, CLS, VER,
 * HELP, HELP /TUTORIAL, SCRIBE, GENERATE, SPELL, and REGISTER.
 * Anything unrecognized produces "Bad command or file name".
 *
 * Input is case-insensitive (uppercased before dispatch). Output is written
 * directly to the terminal state using writeLine/writeHtml/writeBlank.
 *
 * Domain: Retro DOS Era
 */

import type { DosFileSystem } from "./dos-file-system";
import type { DosFile } from "../domain/dos-types";
import { terminalState } from "../state/terminal-state.svelte";
import { signInWithEmail } from "#lib/shared/auth/services/authenticator.js";
import { signOut } from "#lib/shared/auth/state/auth-state.svelte.js";
import { auth } from "#lib/shared/auth/firebase.js";

export class CommandParser {
	private readonly fs: DosFileSystem;

	/** When true, the next execute() call handles serial number input */
	private awaitingSerial = false;

	/**
	 * Active interval id for the FORMAT easter-egg progress animation.
	 * Held so it can be cleared both on natural completion and on teardown
	 * (dispose) if the terminal unmounts mid-animation.
	 */
	private formatInterval: ReturnType<typeof setInterval> | null = null;

	constructor(fs: DosFileSystem) {
		this.fs = fs;
	}

	/**
	 * Release any timers this parser owns. Call from the host component's
	 * teardown path so the FORMAT animation can't keep firing against
	 * terminalState after the terminal unmounts.
	 */
	dispose(): void {
		if (this.formatInterval !== null) {
			clearInterval(this.formatInterval);
			this.formatInterval = null;
		}
	}

	execute(input: string): void {
		// Intercept input when waiting for a serial number
		if (this.awaitingSerial) {
			this.handleSerialInput(input);
			return;
		}

		if (input.length === 0) return;

		const upper = input.toUpperCase();
		const parts = upper.split(/\s+/);
		const command = parts[0];
		const args = parts.slice(1);

		switch (command) {
			case "DIR":
				this.handleDir(args);
				break;
			case "TYPE":
				this.handleType(args, input);
				break;
			case "CD":
			case "CHDIR":
				this.handleCd(args);
				break;
			case "CLS":
				this.handleCls();
				break;
			case "VER":
				this.handleVer();
				break;
			case "HELP":
				this.handleHelp(args);
				break;
			case "SCRIBE":
				this.handleScribe();
				break;
			case "GENERATE":
				this.handleGenerate(args);
				break;
			case "SPELL":
				this.handleSpell(args);
				break;
			case "REGISTER":
				this.handleRegister();
				break;
			case "LOGIN":
				this.handleLogin();
				break;
			case "LOGOUT":
				this.handleLogout();
				break;
			case "WHOAMI":
				this.handleWhoami();
				break;
			case "DOOM":
			case "DOOM.EXE":
				this.handleDoom();
				break;
			case "FORMAT":
				this.handleFormat(args);
				break;
			case "DEL":
			case "DELETE":
				this.handleDel(args);
				break;
			case "EDIT":
				this.handleEdit(args);
				break;
			default:
				this.handleUnknown();
				break;
		}
	}

	/* DIR - List files in current directory                               */

	private handleDir(args: string[]): void {
		const seqFilter = args.some((a) => a === "/SEQ" || a === "/S");
		const filter = seqFilter ? "*.SEQ" : undefined;

		const files = this.fs.listFiles(filter);
		const dirs = seqFilter ? [] : this.fs.listDirs();

		terminalState.writeLine(" Volume in drive C is BELLWEATHER");
		terminalState.writeLine(` Directory of ${this.fs.getCurrentPath()}`);
		terminalState.writeBlank();

		// List subdirectories first
		for (const dir of dirs) {
			const line = this.formatDirEntry(dir.name, "<DIR>", "", "");
			terminalState.writeLine(line);
		}

		// List files
		for (const file of files) {
			const line = this.formatFileEntry(file);
			terminalState.writeLine(line);
		}

		// Footer
		const totalFiles = files.length;
		const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
		const stats = this.fs.getStats();

		terminalState.writeLine(
			`      ${totalFiles} file(s)     ${this.formatNumber(totalBytes)} bytes`,
		);
		terminalState.writeLine(
			`                   ${this.formatNumber(stats.freeBytes)} bytes free`,
		);
		terminalState.writeBlank();
	}

	/**
	 * Format a directory entry line in DOS DIR style.
	 *
	 * ```
	 * SEQUENCES <DIR>           06-15-89  10:30a
	 * ```
	 */
	private formatDirEntry(name: string, marker: string, _ext: string, _date: string): string {
		const paddedName = name.padEnd(8);
		return `${paddedName} ${marker}           06-15-89  10:30a`;
	}

	/**
	 * Format a file entry line in DOS DIR style.
	 *
	 * ```
	 * README   TXT       2,048  06-15-89  10:30a
	 * ```
	 */
	private formatFileEntry(file: DosFile): string {
		const paddedName = file.name.padEnd(8);
		const paddedExt = file.ext.padEnd(3);
		const paddedSize = this.formatNumber(file.size).padStart(10);
		return `${paddedName} ${paddedExt} ${paddedSize}  ${file.date}  10:30a`;
	}

	/** Format a number with comma separators (e.g., 35456 -> "35,456") */
	private formatNumber(n: number): string {
		return n.toLocaleString("en-US");
	}

	/* ------------------------------------------------------------------ */
	/* TYPE - Display file contents                                        */
	/* ------------------------------------------------------------------ */

	private handleType(args: string[], rawInput: string): void {
		if (args.length === 0) {
			terminalState.writeLine("Required parameter missing");
			terminalState.writeBlank();
			return;
		}

		// Reconstruct the filename from the raw input to preserve casing
		const filename = rawInput.trim().substring(rawInput.trim().toUpperCase().indexOf("TYPE") + 5).trim();
		const file = this.fs.readFile(filename);

		if (!file) {
			terminalState.writeLine("File not found");
			terminalState.writeBlank();
			return;
		}

		if (file.accessDenied) {
			terminalState.writeLine(
				"Access denied - ORDER DIRECTIVE 7 CLEARANCE LEVEL INSUFFICIENT",
				"red",
			);
			terminalState.writeBlank();
			return;
		}

		if (!file.content) {
			terminalState.writeLine("[No readable content]");
			terminalState.writeBlank();
			return;
		}

		// Display file content line by line
		const contentLines = file.content.split("\n");
		for (const contentLine of contentLines) {
			terminalState.writeLine(contentLine);
		}
		terminalState.writeBlank();
	}

	/* ------------------------------------------------------------------ */
	/* CD - Change directory                                               */
	/* ------------------------------------------------------------------ */

	private handleCd(args: string[]): void {
		if (args.length === 0) {
			// CD with no args shows current directory
			terminalState.writeLine(this.fs.getCurrentPath());
			terminalState.writeBlank();
			return;
		}

		const target = args.join(" ");
		const success = this.fs.changeDir(target);

		if (!success) {
			terminalState.writeLine("Invalid directory");
			terminalState.writeBlank();
			return;
		}

		// Update the prompt to reflect the new directory
		const currentPath = this.fs.getCurrentPath();
		terminalState.promptString = `${currentPath}>`;
		terminalState.writeBlank();
	}

	/* ------------------------------------------------------------------ */
	/* CLS - Clear screen                                                  */
	/* ------------------------------------------------------------------ */

	private handleCls(): void {
		terminalState.clear();
	}

	/* ------------------------------------------------------------------ */
	/* VER - Show version information                                      */
	/* ------------------------------------------------------------------ */

	private handleVer(): void {
		terminalState.writeBlank();
		terminalState.writeLine(
			"TKAUTIL.COM v1.0 \u2014 Bellweather Technical Institute, 1989",
		);
		terminalState.writeBlank();
	}

	/* ------------------------------------------------------------------ */
	/* HELP - Show available commands or launch tutorial                    */
	/* ------------------------------------------------------------------ */

	private handleHelp(args: string[]): void {
		if (args.includes("/TUTORIAL")) {
			terminalState.mode = "scribe";
			terminalState.scribeMode = "tutorial";
			return;
		}

		if (args.includes("/LETHE")) {
			terminalState.writeLine("Bad command or file name");
			terminalState.writeBlank();
			return;
		}

		terminalState.writeBlank();
		terminalState.writeLine("TKAUTIL.COM \u2014 Command Reference", "white");
		terminalState.writeBlank();
		terminalState.writeLine("  DIR            List files in the current directory");
		terminalState.writeLine("  DIR /SEQ       List sequence files only");
		terminalState.writeLine("  TYPE <file>    Display the contents of a file");
		terminalState.writeLine("  CD <dir>       Change directory");
		terminalState.writeLine("  CD \\           Return to root");
		terminalState.writeLine("  CLS            Clear the screen");
		terminalState.writeLine("  VER            Display version information");
		terminalState.writeLine("  HELP           Display this help text");
		terminalState.writeLine("  HELP /TUTORIAL Open the notation tutorial");
		terminalState.writeLine("  SCRIBE         Launch the SCRIBE notation utility");
		terminalState.writeLine("  GENERATE <w>   Generate a sequence for word <w>");
		terminalState.writeLine("  SPELL <w>      Spell a word using TKA letters");
		terminalState.writeLine("  LOGIN          Sign in to Bellweather system");
		terminalState.writeLine("  LOGOUT         Sign out");
		terminalState.writeLine("  WHOAMI         Display current user");
		terminalState.writeLine("  REGISTER       Software registration");
		terminalState.writeBlank();
		terminalState.writeLine("  All commands are case-insensitive.");
		terminalState.writeBlank();
	}

	/* ------------------------------------------------------------------ */
	/* SCRIBE - Launch the SCRIBE menu application                         */
	/* ------------------------------------------------------------------ */

	private handleScribe(): void {
		terminalState.mode = "scribe";
		terminalState.scribeMode = "menu";
	}

	/* ------------------------------------------------------------------ */
	/* GENERATE - Shortcut to generate mode with a word                    */
	/* ------------------------------------------------------------------ */

	private handleGenerate(args: string[]): void {
		if (args.length === 0) {
			terminalState.mode = "scribe";
			terminalState.scribeMode = "generate";
			return;
		}

		terminalState.pendingWord = args[0]!;
		terminalState.mode = "scribe";
		terminalState.scribeMode = "generate";
	}

	/* ------------------------------------------------------------------ */
	/* SPELL - Shortcut to spell mode with a word                          */
	/* ------------------------------------------------------------------ */

	private handleSpell(args: string[]): void {
		if (args.length === 0) {
			terminalState.mode = "scribe";
			terminalState.scribeMode = "spell";
			return;
		}

		terminalState.mode = "scribe";
		terminalState.scribeMode = "spell";
	}

	/* ------------------------------------------------------------------ */
	/* REGISTER - Shareware registration easter egg                        */
	/* ------------------------------------------------------------------ */

	private handleRegister(): void {
		terminalState.writeBlank();
		terminalState.writeLine(
			"\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557",
		);
		terminalState.writeLine(
			"\u2551  BELLWEATHER SOFTWARE REGISTRATION       \u2551",
			"white",
		);
		terminalState.writeLine(
			"\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563",
		);
		terminalState.writeLine(
			"\u2551                                          \u2551",
		);
		terminalState.writeLine(
			"\u2551  This software is licensed under         \u2551",
		);
		terminalState.writeLine(
			"\u2551  Order Directive 7, Section 12.          \u2551",
		);
		terminalState.writeLine(
			"\u2551                                          \u2551",
		);
		terminalState.writeLine(
			"\u2551  To register, mail a check or money      \u2551",
		);
		terminalState.writeLine(
			"\u2551  order for $149.95 USD to:               \u2551",
		);
		terminalState.writeLine(
			"\u2551                                          \u2551",
		);
		terminalState.writeLine(
			"\u2551    Bellweather Technical Institute        \u2551",
		);
		terminalState.writeLine(
			"\u2551    Attn: Software Registration Dept.     \u2551",
		);
		terminalState.writeLine(
			"\u2551    P.O. Box [REDACTED]                   \u2551",
		);
		terminalState.writeLine(
			"\u2551    [REDACTED], MA [REDACTED]             \u2551",
		);
		terminalState.writeLine(
			"\u2551                                          \u2551",
		);
		terminalState.writeLine(
			"\u2551  Include your Bellweather-issued          \u2551",
		);
		terminalState.writeLine(
			"\u2551  serial number with payment.             \u2551",
		);
		terminalState.writeLine(
			"\u2551                                          \u2551",
		);
		terminalState.writeLine(
			"\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D",
		);
		terminalState.writeBlank();

		// Switch to serial number prompt and wait for input
		this.awaitingSerial = true;
		this.savedPrompt = terminalState.promptString;
		terminalState.promptString = "Enter serial number (or press ESC): ";
	}

	/**
	 * Handle serial number input from the REGISTER prompt.
	 *
	 * Every serial number is rejected - this is a fictional product from 1989
	 * and Bellweather's registration department has been [REDACTED] since 1997.
	 * Empty input (user just pressed Enter or ESC) silently returns to prompt.
	 */
	private handleSerialInput(input: string): void {
		this.awaitingSerial = false;
		terminalState.promptString = this.savedPrompt;

		if (input.length > 0) {
			terminalState.writeLine(
				"SERIAL NUMBER NOT RECOGNIZED. Contact your Order liaison.",
				"red",
			);
			terminalState.writeBlank();
		}
	}

	/** Saved prompt string to restore after the REGISTER dialog */
	private savedPrompt = "C:\\BELLWTHR>";

	/* ------------------------------------------------------------------ */
	/* LOGIN - Firebase email/password authentication                      */
	/* ------------------------------------------------------------------ */

	private handleLogin(): void {
		if (auth.currentUser) {
			terminalState.writeLine(
				`Already authenticated as ${auth.currentUser.displayName ?? auth.currentUser.email}.`,
			);
			terminalState.writeBlank();
			return;
		}

		terminalState.writeBlank();
		terminalState.writeLine("BELLWEATHER AUTHENTICATION SYSTEM", "white");
		terminalState.writeBlank();

		const savedPrompt = terminalState.promptString;
		terminalState.promptString = "E-mail: ";

		terminalState.inputHandler = (email: string) => {
			if (!email) {
				terminalState.inputHandler = null;
				terminalState.promptString = savedPrompt;
				return;
			}

			terminalState.promptString = "Password: ";
			terminalState.inputMask = true;

			terminalState.inputHandler = (password: string) => {
				terminalState.inputHandler = null;
				terminalState.inputMask = false;
				terminalState.promptString = savedPrompt;

				if (!password) return;

				terminalState.writeLine("Authenticating...");
				signInWithEmail(email, password)
					.then(() => {
						const user = auth.currentUser;
						const name = user?.displayName ?? user?.email ?? "unknown";
						terminalState.writeBlank();
						terminalState.writeLine(`Welcome, ${name}. Access granted.`, "white");
						terminalState.writeBlank();
						this.updatePromptForAuth();
					})
					.catch(() => {
						terminalState.writeBlank();
						terminalState.writeLine(
							"ACCESS DENIED: Credentials not recognized.",
							"red",
						);
						terminalState.writeBlank();
					});
			};
		};
	}

	/* ------------------------------------------------------------------ */
	/* LOGOUT - Sign out of Firebase                                       */
	/* ------------------------------------------------------------------ */

	private handleLogout(): void {
		if (!auth.currentUser) {
			terminalState.writeLine("Not currently authenticated.");
			terminalState.writeBlank();
			return;
		}

		signOut().then(() => {
			terminalState.writeLine("Signed out. Session terminated.");
			terminalState.writeBlank();
			terminalState.authenticatedUser = null;
			terminalState.promptString = "C:\\BELLWTHR>";
		});
	}

	/* ------------------------------------------------------------------ */
	/* WHOAMI - Show current user                                          */
	/* ------------------------------------------------------------------ */

	private handleWhoami(): void {
		const user = auth.currentUser;
		if (!user) {
			terminalState.writeLine("Not authenticated. Type LOGIN to sign in.");
			terminalState.writeBlank();
			return;
		}

		terminalState.writeBlank();
		if (user.displayName) {
			terminalState.writeLine(`  Name:  ${user.displayName}`);
		}
		if (user.email) {
			terminalState.writeLine(`  Email: ${user.email}`);
		}
		terminalState.writeLine(`  UID:   ${user.uid}`);
		terminalState.writeBlank();
	}

	/** Update prompt and terminal state to reflect auth */
	updatePromptForAuth(): void {
		const user = auth.currentUser;
		if (user) {
			const label = user.displayName ?? user.email ?? "user";
			terminalState.authenticatedUser = label;
			terminalState.promptString = `C:\\BELLWTHR [${label}]>`;
		} else {
			terminalState.authenticatedUser = null;
			terminalState.promptString = "C:\\BELLWTHR>";
		}
	}

	/* ------------------------------------------------------------------ */
	/* Easter eggs                                                         */
	/* ------------------------------------------------------------------ */

	private handleDoom(): void {
		terminalState.writeLine(
			"DOOM.EXE not found. Insufficient memory. Nice try.",
		);
		terminalState.writeBlank();
	}

	private handleFormat(args: string[]): void {
		if (!args.some((a) => a.startsWith("C"))) {
			terminalState.writeLine("Required parameter missing");
			terminalState.writeBlank();
			return;
		}

		terminalState.writeLine("WARNING, ALL DATA ON NON-REMOVABLE DISK");
		terminalState.writeLine("DRIVE C: WILL BE LOST!");

		// Clear any in-flight FORMAT animation before starting a new one.
		if (this.formatInterval !== null) {
			clearInterval(this.formatInterval);
			this.formatInterval = null;
		}

		let progress = 0;
		this.formatInterval = setInterval(() => {
			progress += Math.floor(Math.random() * 8) + 3;
			if (progress >= 99) {
				if (this.formatInterval !== null) {
					clearInterval(this.formatInterval);
					this.formatInterval = null;
				}
				terminalState.writeLine(
					"FORMAT ABORTED: Cannot format active notation archive.",
					"red",
				);
				terminalState.writeBlank();
				return;
			}
			terminalState.writeLine(`  ${progress} percent completed.`);
		}, 200);
	}

	private handleDel(args: string[]): void {
		if (args.includes("*.*")) {
			const savedPrompt = terminalState.promptString;
			terminalState.writeLine(
				`All files in ${this.fs.getCurrentPath()}\\? Are you sure (Y/N)?`,
			);
			terminalState.promptString = "";

			terminalState.inputHandler = (input: string) => {
				terminalState.inputHandler = null;
				terminalState.promptString = savedPrompt;

				if (input.toUpperCase() === "Y") {
					terminalState.writeLine(
						"ERROR: Notation archives are protected by Order Directive 7.",
						"red",
					);
				}
				terminalState.writeBlank();
			};
			return;
		}

		terminalState.writeLine("File not found");
		terminalState.writeBlank();
	}

	private handleEdit(args: string[]): void {
		if (args.some((a) => a.includes("CONFIG"))) {
			terminalState.writeBlank();
			terminalState.writeLine("DEVICE=C:\\SYSTEM\\KINETIC.SYS");
			terminalState.writeLine("DEVICE=C:\\SYSTEM\\SPIRAL.DRV");
			terminalState.writeLine("DEVICE=C:\\SYSTEM\\GRID.DRV");
			terminalState.writeLine("FILES=40");
			terminalState.writeLine("BUFFERS=30");
			terminalState.writeLine(
				"NOTATION_SUPPRESS=TRUE  ; DO NOT MODIFY - ORDER DIRECTIVE 7",
				"red",
			);
			terminalState.writeBlank();
			return;
		}

		terminalState.writeLine("Bad command or file name");
		terminalState.writeBlank();
	}

	/* ------------------------------------------------------------------ */
	/* Unknown command                                                     */
	/* ------------------------------------------------------------------ */

	private handleUnknown(): void {
		terminalState.writeLine("Bad command or file name");
		terminalState.writeBlank();
	}
}
