/**
 * Commitlint — mechanically enforces the Conventional Commits + 50/72 rules
 * documented in .gitmessage. Runs:
 *   - locally: pre-commit commit-msg hook
 *   - in CI:    format.yml workflow
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // .gitmessage: subject ≤50 (target) / 72 (hard). config-conventional defaults
    // header-max-length to 100 — tighten to our 72.
    "header-max-length": [2, "always", 72],
    "body-max-line-length": [2, "always", 72],
  },
};
