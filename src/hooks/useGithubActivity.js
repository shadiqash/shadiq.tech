import { useEffect, useState } from "react";

export default function useGithubActivity() {
  const [count, setCount] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch("https://api.github.com/users/shadiqash/events/public")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((events) => {
        if (cancelled || !Array.isArray(events)) return;
        const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const recent = events.filter(
          (e) =>
            (e.type === "PushEvent" || e.type === "PullRequestEvent") &&
            new Date(e.created_at).getTime() > cutoff
        );
        setCount(recent.length);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return count;
}
