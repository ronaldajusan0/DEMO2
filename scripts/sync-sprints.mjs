#!/usr/bin/env node
/**
 * sync-sprints.mjs
 *
 * Pulls open+closed issues from the GitHub repo and regenerates the JSON files
 * under sprints/, one file per milestone. Grouping and schema match
 * sprints/sprint-1.json.
 *
 * Requirements: `gh` CLI authenticated (gh auth login) OR GH_TOKEN set.
 *
 * Usage:
 *   node scripts/sync-sprints.mjs                # auto-detect repo from git remote
 *   node scripts/sync-sprints.mjs --repo owner/name
 *   node scripts/sync-sprints.mjs --dry          # print, do not write
 *
 * Conventions read from issues:
 *   - Estimate: a label like "points:5", or "<!-- estimate: 5 -->" in the body.
 *   - Status:   a label like "status:in-progress"; else derived from issue state.
 *   - Acceptance: lines under an "## Acceptance" / "Acceptance:" heading in the body,
 *                 each bullet becomes one array entry.
 *   - Sprint order: milestones are sorted by their due date, then title.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "sprints");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const repoArg = valueOf("--repo");

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

function gh(cliArgs) {
  return execFileSync("gh", cliArgs, { encoding: "utf8" });
}

function resolveRepo() {
  if (repoArg) return repoArg;
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      cwd: ROOT,
    }).trim();
    const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
    if (m) return m[1];
  } catch {
    /* no remote */
  }
  throw new Error("Cannot resolve repo. Pass --repo owner/name.");
}

function parseEstimate(labels, body) {
  const lbl = labels.find((l) => /^points?:/i.test(l.name));
  if (lbl) {
    const n = parseInt(lbl.name.split(":")[1], 10);
    if (!Number.isNaN(n)) return n;
  }
  const m = body && body.match(/estimate:\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function parseStatus(labels, state) {
  const lbl = labels.find((l) => /^status:/i.test(l.name));
  if (lbl) return lbl.name.split(":")[1].toLowerCase();
  return state === "CLOSED" ? "done" : "todo";
}

function parseAcceptance(body) {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (/^\s*#{0,6}\s*acceptance\b/i.test(line) || /^acceptance:/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (/^\s*#{1,6}\s/.test(line)) break; // next heading ends section
      const bullet = line.match(/^\s*[-*]\s+(.*\S)/);
      if (bullet) out.push(bullet[1].trim());
      else if (line.trim() === "" && out.length) break;
    }
  }
  return out;
}

function slug(n) {
  return `sprint-${n}.json`;
}

function main() {
  const repo = resolveRepo();
  console.error(`Syncing sprints from ${repo} ...`);

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
    "number,title,state,labels,assignees,milestone,body,url",
  ]);
  const issues = JSON.parse(raw);

  // Group by milestone (issues without a milestone go into "Backlog").
  const groups = new Map();
  for (const iss of issues) {
    const key = iss.milestone?.title || "Backlog";
    if (!groups.has(key)) groups.set(key, { milestone: iss.milestone, issues: [] });
    groups.get(key).issues.push(iss);
  }

  // Order milestones by due date then title; Backlog last.
  const ordered = [...groups.entries()].sort((a, b) => {
    if (a[0] === "Backlog") return 1;
    if (b[0] === "Backlog") return -1;
    const da = a[1].milestone?.dueOn || "9999";
    const db = b[1].milestone?.dueOn || "9999";
    return da.localeCompare(db) || a[0].localeCompare(b[0]);
  });

  const now = new Date().toISOString();
  let sprintNo = 0;

  if (!DRY && !existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  for (const [milestoneName, group] of ordered) {
    sprintNo += 1;
    const mappedIssues = group.issues
      .sort((a, b) => a.number - b.number)
      .map((iss) => ({
        number: iss.number,
        title: iss.title,
        state: iss.state.toLowerCase(),
        labels: iss.labels.map((l) => l.name),
        assignees: iss.assignees.map((a) => a.login),
        milestone: milestoneName,
        estimate: parseEstimate(iss.labels, iss.body),
        status: parseStatus(iss.labels, iss.state),
        acceptance: parseAcceptance(iss.body),
        url: iss.url,
      }));

    const capacityPoints = mappedIssues.reduce(
      (sum, i) => sum + (i.estimate || 0),
      0,
    );

    const doc = {
      sprint: sprintNo,
      name: milestoneName,
      goal: group.milestone?.description || "",
      startDate: null,
      endDate: group.milestone?.dueOn || null,
      capacityPoints,
      milestone: milestoneName,
      repo,
      generatedFrom: "github-issues",
      syncedAt: now,
      issues: mappedIssues,
    };

    const file = join(OUT_DIR, slug(sprintNo));
    const json = JSON.stringify(doc, null, 2) + "\n";
    if (DRY) {
      console.error(`--- ${file} (${mappedIssues.length} issues) ---`);
      console.log(json);
    } else {
      writeFileSync(file, json);
      console.error(`Wrote ${file} (${mappedIssues.length} issues, ${capacityPoints} pts)`);
    }
  }

  if (sprintNo === 0) console.error("No issues found. Nothing written.");
  else console.error(`Done. ${sprintNo} sprint file(s).`);
}

main();
