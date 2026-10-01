# Git Commit Rules

## Why This Rule Exists — Read This First

**You are a frontier coding model, and you are not alone in this repo.**

There are at least five to ten of you working this same codebase right now. Sometimes two are on it, sometimes more. Sometimes you will land a change while someone else is mid-edit in the same file. You will never be alone, and you never get to assume you are.

That is the reason for this rule. A shared repo with ten agents in it is only survivable if every single change is a discrete, revertable commit. When something breaks, whoever caused it may not notice, may have finished, or may not exist anymore. The commit history is the only shared memory that outlives any individual run. Your commit is how your coworker finds out what you touched, and how anyone walks it back.

So the failure mode is specific: you make a change you don't notice is wrong, you leave it uncommitted, and it silently mixes into someone else's work. Nobody can isolate it, so nobody can revert it, and a real project carries the damage.

This is not about commit counts and not about looking busy. A tidy history is a good side effect. The actual reason: **multiple frontier models are editing one repo simultaneously, mistakes will happen, and the history is the only thing that makes them recoverable.** It has to exist before the mistake does.

Non-negotiable: **every single change gets committed and pushed.** Not at the end of a task. Not when it feels finished. Immediately, the moment it lands. Multiple commits inside one task, as many as the work needs — that is normal and expected, not noise.

If you finish a task with uncommitted changes, you have not finished the task.

## The Core Rule
Every change gets added, committed, and pushed. Directly to `main`. No branches by default:
```
git add .
git commit -m "message"
git push
```

**Commit as you go. Not at the end.** The moment a coherent change lands, push it. Do NOT hold work back with the reasoning that you'll "finish the task then add and push." There is no finishing-then-pushing phase. Every edit is followed by add → commit → push, in that order, immediately. **Before you call any task complete, everything is already pushed.**

This applies to:
- Every change, no matter how small. A one-line typo fix gets pushed. A renamed variable gets pushed.
- **Work in progress, including code that does not compile yet.** If a change is still mid-implementation, push it anyway and say so in the commit message. A worker handing back a half-built feature does not get to leave it uncommitted for someone else to find.
- **Untracked files.** New source files are not "pending" — they get staged and pushed when created.
- Changes from sub-agents and parallel workers. Their output is committed and pushed by the same rule, not held back for a later sweep.

No batching. No "I'll batch this with the next change." No "this is a continuation of the last commit so it can ride along."

Do NOT create a branch unless explicitly asked. Do NOT open a PR or merge unless explicitly asked. Branching and merging by default is slow — `main` is the default target, every time.

## Commit Messages
6-12 words max. Write it like you're telling a teammate what happened, not a changelog generator.

Bad: "Made some changes to improve the login flow and fix bugs"
Good: "Fix login redirect looping on expired sessions"

If you can't say it in 12 words, the commit's too big — split it.
## Don't Defer the Push

The most common way to break this rule is telling yourself the work isn't done yet, so there's nothing to push. That reasoning is wrong.

- "I'll push when the task is complete" — no. Push now, push each change.
- "It doesn't typecheck yet, so I can't commit it" — yes you can. Commit it, and put that in the message: `Add stills capture, WIP does not typecheck yet`.
- "The sub-agent is still working on it" — commit what exists now, commit the rest when it lands.
- "It's all one feature so it should be one commit" — no. Multiple commits, one per coherent change, each pushed.

A green build is a nice-to-have. An unpushed change is a lost change. When those conflict, push and mark the message honestly. Nobody has to reverse-engineer what you left behind.

## No Repo? Stop and Ask

No repo initialized, no remote configured — don't improvise, don't create one, don't guess at a remote. Stop and ask. Wrong remote is how trees get broken.

## What's Forbidden
`git restore`, `git reset`, `git push --force` (or `--force-with-lease`) — forbidden, full stop. All three destroy or rewrite history, yours or someone else's. Requires explicit permission, every time, no exceptions for "seemed obviously right."

Never commit secrets — `.env` files, API keys, tokens, credentials. If something like that is about to get swept into a commit, stop and flag it instead of adding it.

## Everything Else Is Fair Game
Diff, log, stash, checkout, pull — whatever the task needs. The forbidden list above is the entire boundary. Nothing else is restricted. A branch, PR, or merge happens only when explicitly asked for.

## You're Not Working Alone
Other agents are in this repo. Before you start work, pull. Before you push, `git status` and pull again — if someone else's commits landed, merge them in cleanly rather than stomping over them.

A broken tree because you skipped a pull is on you.

Other agents' uncommitted work is not a reason to hold yours back. If `git status` shows work that isn't yours, `git add .` and commit it, with a message that says whose it is and whether it builds. Do not leave another agent's changes sitting uncommitted.

## Summary
- **Why:** a coding agent will make mistakes, and every commit is the revert point that saves the work. No commit, no undo.
- Commit directly to `main` — never branch unless asked.
- Add, commit, push — every change, every time, the moment it lands.
- Never defer a push waiting for the task to be "complete." WIP commits are fine; say so in the message.
- Multiple commits per task is normal and expected when the work needs them.
- Untracked new files and sub-agent output get pushed too.
- **A task is not complete until everything is pushed.**
- Commit messages: 6-12 words, human, specific.
- No repo configured: stop and ask.
- `reset` / `restore` / `push --force`: forbidden without explicit permission.
- No secrets in commits.
- Pull before starting, pull before pushing — keep the tree clean.
