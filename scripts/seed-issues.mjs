#!/usr/bin/env node
/**
 * seed-issues.mjs
 *
 * Creates GitHub milestones, labels, and issues from the local sprints/*.json
 * files, so the repo has real issues that sync-sprints.mjs can later read back.
 *
 * Idempotent-ish: skips creating an issue whose exact title already exists.
 *
 * Requirements: `gh` CLI authenticated (gh auth login) OR GH_TOKEN set.
 *
 * Usage:
 *   node scripts/seed-issues.mjs                 # create on the origin repo
 *   node scripts/seed-issues.mjs --repo owner/name
 *   node scripts/seed-issues.mjs --dry           # print what it would do
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPRINTS = join(ROOT, "sprints");
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const repoArg = valueOf("--repo");

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}
function gh(a, opts = {}) {
  return execFileSync("gh", a, { encoding: "utf8", ...opts });
}
function resolveRepo() {
  if (repoArg) return repoArg;
  const url = execFileSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
    cwd: ROOT,
  }).trim();
  const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
  if (!m) throw new Error("Cannot resolve repo. Pass --repo owner/name.");
  return m[1];
}

function ensureLabel(repo, name, color) {
  if (DRY) return console.error(`[dry] label ${name}`);
  try {
    gh(["label", "create", name, "--repo", repo, "--color", color], {
      stdio: "pipe",
    });
    console.error(`label + ${name}`);
  } catch {
    /* exists */
  }
}

function ensureMilestone(repo, title, dueOn) {
  if (DRY) return console.error(`[dry] milestone ${title}`);
  // gh has no first-class milestone create; use the REST API.
  const body = [`-f`, `title=${title}`, `-f`, `state=open`];
  if (dueOn) body.push("-f", `due_on=${dueOn}`);
  try {
    gh(["api", `repos/${repo}/milestones`, ...body], { stdio: "pipe" });
    console.error(`milestone + ${title}`);
  } catch {
    /* likely exists */
  }
}

function existingTitles(repo) {
  const raw = gh([
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--limit",
    "500",
    "--json",
    "title",
  ]);
  return new Set(JSON.parse(raw).map((i) => i.title));
}

function issueBody(issue) {
  const lines = [];
  if (issue.acceptance?.length) {
    lines.push("## Acceptance");
    for (const a of issue.acceptance) lines.push(`- ${a}`);
    lines.push("");
  }
  lines.push(`<!-- estimate: ${issue.estimate ?? 0} -->`);
  return lines.join("\n");
}

function main() {
  const repo = resolveRepo();
  console.error(`Seeding issues into ${repo} ...`);

  const files = readdirSync(SPRINTS)
    .filter((f) => /^sprint-\d+\.json$/.test(f))
    .sort();

  ensureLabel(repo, "feat", "1d76db");
  ensureLabel(repo, "chore", "cccccc");
  ensureLabel(repo, "fix", "d73a4a");

  const seenLabels = new Set(["feat", "chore", "fix"]);
  const existing = DRY ? new Set() : existingTitles(repo);

  const milestones = new Map();
  const sprints = files.map((f) =>
    JSON.parse(readFileSync(join(SPRINTS, f), "utf8")),
  );
  for (const s of sprints) {
    for (const iss of s.issues) {
      if (iss.milestone && !milestones.has(iss.milestone)) {
        milestones.set(iss.milestone, s.endDate || null);
      }
      for (const l of iss.labels) {
        if (!seenLabels.has(l)) {
          ensureLabel(repo, l, "ededed");
          seenLabels.add(l);
        }
      }
    }
  }
  for (const [title, due] of milestones) ensureMilestone(repo, title, due);

  let created = 0;
  let skipped = 0;
  for (const s of sprints) {
    for (const iss of s.issues) {
      if (existing.has(iss.title)) {
        skipped++;
        continue;
      }
      const labels = [...iss.labels];
      if (iss.estimate) labels.push(`points:${iss.estimate}`);
      const cmd = [
        "issue",
        "create",
        "--repo",
        repo,
        "--title",
        iss.title,
        "--body",
        issueBody(iss),
      ];
      for (const l of labels) cmd.push("--label", l);
      if (iss.milestone) cmd.push("--milestone", iss.milestone);

      if (DRY) {
        console.error(`[dry] issue: ${iss.title} [${labels.join(", ")}] -> ${iss.milestone}`);
      } else {
        // Ensure points label exists before assigning.
        if (iss.estimate) ensureLabel(repo, `points:${iss.estimate}`, "0e8a16");
        const out = gh(cmd);
        console.error(`issue + ${iss.title.slice(0, 50)}  ${out.trim().split("\n").pop()}`);
        created++;
      }
    }
  }

  console.error(
    DRY
      ? "Dry run complete."
      : `Done. ${created} issue(s) created, ${skipped} skipped (already existed).`,
  );
  if (!DRY) console.error("Now run: node scripts/sync-sprints.mjs");
}

main();
