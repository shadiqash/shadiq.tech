import React from "react";

export default function GithubPulse({ count }) {
  if (count === null) return null;
  return (
    <div className="github-pulse">
      <span className="pulse-dot" aria-hidden="true" />
      {count > 0
        ? `${count} commit${count === 1 ? "" : "s"} on GitHub, past 14 days`
        : "quiet on GitHub the past 14 days"}
    </div>
  );
}
