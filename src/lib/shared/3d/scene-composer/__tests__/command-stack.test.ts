import { describe, it, expect, beforeEach } from "vitest";
import { CommandStack, type Command } from "#lib/shared/history/command-stack.svelte.js";

// State is tracked in closure variables rather than on `this`. The CommandStack
// stores commands in `$state([])` arrays, which deep-proxy their contents — so
// the command the stack invokes is a Svelte reactive proxy, not this original
// object, and `this`-based mutations don't read back through the original
// reference. Closure flags observe the real execute()/undo() calls regardless.
function makeCommand(label: string): Command & {
	readonly executed: boolean;
	readonly undone: boolean;
} {
	let executed = false;
	let undone = false;
	return {
		label,
		execute() {
			executed = true;
			undone = false;
		},
		undo() {
			undone = true;
			executed = false;
		},
		get executed() {
			return executed;
		},
		get undone() {
			return undone;
		},
	};
}

describe("CommandStack", () => {
	let stack: CommandStack;

	beforeEach(() => {
		stack = new CommandStack();
	});

	it("executes a command and tracks it", () => {
		const cmd = makeCommand("Place Rock");
		stack.execute(cmd);
		expect(cmd.executed).toBe(true);
		expect(stack.canUndo).toBe(true);
		expect(stack.canRedo).toBe(false);
	});

	it("undoes a command", () => {
		const cmd = makeCommand("Place Rock");
		stack.execute(cmd);
		stack.undo();
		expect(cmd.undone).toBe(true);
		expect(stack.canUndo).toBe(false);
		expect(stack.canRedo).toBe(true);
	});

	it("redoes an undone command", () => {
		const cmd = makeCommand("Place Rock");
		stack.execute(cmd);
		stack.undo();
		stack.redo();
		expect(cmd.executed).toBe(true);
		expect(stack.canUndo).toBe(true);
		expect(stack.canRedo).toBe(false);
	});

	it("clears redo stack on new action after undo", () => {
		const cmd1 = makeCommand("Place Rock");
		const cmd2 = makeCommand("Place Tree");
		stack.execute(cmd1);
		stack.undo();
		stack.execute(cmd2);
		expect(stack.canRedo).toBe(false);
	});

	it("records a command whose initial mutation already happened", () => {
		const cmd = makeCommand("Move Step");
		stack.record(cmd);
		expect(cmd.executed).toBe(false);
		expect(stack.undoLabel).toBe("Move Step");

		stack.undo();
		expect(cmd.undone).toBe(true);
	});

	it("bounds retained history", () => {
		const bounded = new CommandStack(2);
		bounded.record(makeCommand("first"));
		bounded.record(makeCommand("second"));
		bounded.record(makeCommand("third"));

		bounded.undo();
		expect(bounded.undoLabel).toBe("second");
		bounded.undo();
		expect(bounded.canUndo).toBe(false);
	});

	it("clear() resets both stacks", () => {
		stack.execute(makeCommand("a"));
		stack.execute(makeCommand("b"));
		stack.undo();
		stack.clear();
		expect(stack.canUndo).toBe(false);
		expect(stack.canRedo).toBe(false);
	});
});
