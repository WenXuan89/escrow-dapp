# GitHub Guide for the Escrow DApp Team (Beginner Edition)
---

## Part 0 — The one-sentence mental model

- **Git** = a tool on your own computer that saves "checkpoints" (commits) of your code so you can undo mistakes and see history.
- **GitHub** = a website that holds a shared copy of those checkpoints, so all 4 of you can sync with each other.
- **Branch** = your own private workspace inside the shared project, so you can work without disturbing everyone else's code until you're ready to share it.

---

## Part 1 — One-time setup

### Step 1: Everyone installs Git

- **Windows:** download from [git-scm.com](https://git-scm.com/downloads), run the installer, keep all default options.
- **Mac:** open Terminal and type `git --version` — if it's not installed, it'll prompt you to install Xcode command line tools; accept.

Check it worked (open Terminal / Git Bash / Command Prompt):
```bash
git --version
```

### Step 2: Everyone creates a free GitHub account

Go to [github.com](https://github.com) and sign up, if you haven't already.

### Step 3 (recommended for beginners): Install GitHub Desktop

Command-line Git works fine, but **GitHub Desktop** (github.com/apps/desktop) gives you a visual app — you click buttons instead of typing commands for most day-to-day actions (commit, push, pull, branch). This guide shows both the command and the GitHub Desktop equivalent, so pick whichever your team prefers. You can also mix — some members use the app, others use the terminal; it's the same underlying repository either way.

### Step 4: One person creates the repository

Pick one team member to do this (e.g. whoever set up Truffle):

1. Go to github.com → click the **+** icon (top right) → **New repository**.
2. Name it (e.g. `escrow-dapp`).
3. Set visibility to **Private** (this is coursework, keep it private).
4. Check "Add a .gitignore" → choose **Node** from the template list (this automatically excludes `node_modules/` and build files — the folders that are huge and shouldn't be uploaded).
5. Click **Create repository**.

### Step 5: Add your 3 teammates as collaborators

On the repository page: **Settings** → **Collaborators** → **Add people** → enter each teammate's GitHub username or email → they'll get an invite email to accept.

### Step 6: Everyone clones the repository onto their own device

"Cloning" downloads a full working copy onto your computer.

**Command line:**
```bash
git clone https://github.com/YOUR-TEAM/escrow-dapp.git
cd escrow-dapp
```

**GitHub Desktop:** File → Clone Repository → select `escrow-dapp` from the list → choose a folder on your computer → Clone.

### Step 7: The person with the Truffle project pushes it in

If Truffle was already set up in Part 1 of our earlier conversation, that person copies their existing `escrow-dapp` project files into the cloned folder (or just runs `truffle init` inside the cloned folder directly), then:

```bash
git add .
git commit -m "Initial Truffle setup with stub contracts"
git push origin main
```

Everyone else then pulls this down (see Step 8 below) before starting work.

### Step 8: Everyone installs the Node dependencies locally

`node_modules/` isn't stored in GitHub (it's in `.gitignore` on purpose — it's huge and regenerable), so each person needs to rebuild it once, after every pull that changes `package.json`:

```bash
npm install
```

---

## Part 2 — Your day-to-day workflow (repeat this every session)

The golden rule: **never write code directly on `main`.** Each person works on their own branch, then merges back in when ready. This is what prevents 4 people's changes from clobbering each other.

### Step 1: Start your session by getting the latest code

**Command line:**
```bash
git checkout main
git pull origin main
```

**GitHub Desktop:** make sure the branch dropdown says `main`, click **Fetch origin**, then **Pull origin** if there are new changes.

### Step 2: Create your own branch for today's task

Name it after what you're doing, e.g. `person-a-registration`, `person-b-payout`.

**Command line:**
```bash
git checkout -b person-a-registration
```

**GitHub Desktop:** Branch menu → New Branch → name it → Create.

> Only do this once per feature — if you're continuing the same task tomorrow, skip this step and just `git checkout person-a-registration` to switch back into it (or select it from GitHub Desktop's branch dropdown).

### Step 3: Do your work

Edit `Escrow.sol` (or whichever file), and test it — either in Remix (paste in your in-progress code) or by running `truffle compile` locally if you want to catch syntax errors early:

```bash
truffle compile
```

### Step 4: Save a checkpoint (commit) — do this often, in small chunks

Don't wait until your whole task is done — commit each time you finish a small working piece (e.g. one function).

**Command line:**
```bash
git add contracts/Escrow.sol
git commit -m "Implement registerUser() function"
```

**GitHub Desktop:** you'll see your changed file listed on the left with a diff view; type a short summary in the box at the bottom left, click **Commit to person-a-registration**.

### Step 5: Push your branch to GitHub (share it with the team)

**Command line:**
```bash
git push origin person-a-registration
```

**GitHub Desktop:** click **Publish branch** (first time) or **Push origin** (after that).

### Step 6: Open a Pull Request (PR) when your task is ready to merge

A Pull Request is just a page on GitHub saying "here's what I changed, please review and merge it into main."

1. Go to your repository on github.com — it'll usually show a banner "Compare & pull request" for your recently pushed branch. Click it.
2. Write a short description of what you did.
3. Click **Create pull request**.
4. Ask one teammate to look it over (even a quick skim) and click **Merge pull request**.

### Step 7: Everyone syncs again after a merge

Whenever someone's PR gets merged into `main`, everyone else should pull the update before continuing:

```bash
git checkout main
git pull origin main
```

Then, if you're continuing your own task, switch back to your branch and optionally bring the latest `main` changes into it:
```bash
git checkout person-a-registration
git merge main
```

---

## Part 3 — If you hit a merge conflict

This happens when two people changed the exact same lines of a file. Git will mark it like this inside the file:

```solidity
<<<<<<< HEAD
function completeMilestone(...) public {
    // your version
}
=======
function completeMilestone(...) public {
    // teammate's version
}
>>>>>>> person-b-payout
```

**What to do:**
1. Open the file, read both versions.
2. Manually edit it to keep the correct code (or combine both).
3. Delete the `<<<<<<<`, `=======`, and `>>>>>>>` marker lines completely.
4. Save the file, then:
```bash
git add contracts/Escrow.sol
git commit -m "Resolve merge conflict in completeMilestone"
git push origin person-a-registration
```

**Tip for your team specifically:** since your function signatures were agreed in advance and each person only edits their own labeled section of `Escrow.sol`, conflicts should be rare — they mostly happen if two people edit the shared top section (enums/structs/state variables) at the same time. Agree as a team before anyone changes that shared section.

**First-time tip:** do your very first merge together on a call, so everyone sees what a conflict looks like once, in a calm setting — much easier than hitting it solo at 11pm before a deadline.

---

## Part 4 — Quick command cheat-sheet

| Command | What it does |
|---|---|
| `git status` | Shows what files you've changed |
| `git checkout main` | Switch to the main branch |
| `git pull origin main` | Download the latest merged code |
| `git checkout -b <name>` | Create and switch to a new branch |
| `git checkout <name>` | Switch to an existing branch |
| `git add <file>` | Stage a file to be saved in your next commit |
| `git add .` | Stage all changed files |
| `git commit -m "message"` | Save a checkpoint with a description |
| `git push origin <branch>` | Upload your branch to GitHub |
| `git merge main` | Bring the latest main-branch changes into your current branch |
| `truffle compile` | Recompile contracts to check for errors |
| `truffle migrate --reset` | Redeploy contracts fresh onto Ganache |

---

## Part 5 — A few beginner pitfalls to avoid

- **Don't commit `node_modules/`.** It's huge (often 100+ MB) and regenerable via `npm install`. Make sure it's in `.gitignore` (the Node template from Step 4 already handles this).
- **Don't work directly on `main`.** Always branch first — it costs one extra command and saves you from conflicts wiping out someone's unsaved work.
- **Commit small and often**, not one giant commit at the end of your task — smaller commits are far easier to review and, if something breaks, easier to undo.
- **Pull before you start, every session.** Someone else's merged PR from yesterday won't appear in your files until you `git pull`.
- **If you're ever unsure what state you're in**, run `git status` — it tells you your current branch and whether you have uncommitted changes.
