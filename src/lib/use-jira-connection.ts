'use client';

import { useEffect, useState } from 'react';

export interface JiraConnectionInfo {
  connected: boolean;
  baseUrl?: string;
  projectKey?: string;
}

export function useJiraConnection() {
  const [info, setInfo] = useState<JiraConnectionInfo>({ connected: false });

  useEffect(() => {
    fetch('/api/import/jira')
      .then((res) => res.json())
      .then(setInfo)
      .catch(() => setInfo({ connected: false }));
  }, []);

  return info;
}

/** Best-effort check that an epic actually came from Jira (vs. created in EpicFlow or from an Excel import). */
export function isJiraSourced(epicId: string): boolean {
  return epicId.startsWith('jira-');
}
