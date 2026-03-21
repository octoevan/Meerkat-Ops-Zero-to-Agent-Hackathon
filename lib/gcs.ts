import { Storage } from '@google-cloud/storage';

// Initialize with service account key from env
// The env var holds the path to the JSON key file
const storage = new Storage({
  keyFilename: process.env.GCS_KEY_FILE,
  projectId: process.env.GCP_PROJECT_ID,
});

const BUCKET_NAME = process.env.GCS_LOG_BUCKET || 'meerkat-ops-logs';

export interface LogEntry {
  timestamp: string;
  source: string;
  event: string;
  user?: string;
  ip?: string;
  resource?: string;
  risk_score: number;
  details: string;
  [key: string]: unknown;
}

/**
 * Lists all log files in the bucket and returns their contents combined.
 * Each file is expected to be a JSON array of log entries.
 */
export async function fetchLogsFromGCS(): Promise<{
  files: string[];
  logs: LogEntry[];
  totalCount: number;
}> {
  const bucket = storage.bucket(BUCKET_NAME);
  const [files] = await bucket.getFiles();

  const allLogs: LogEntry[] = [];
  const fileNames: string[] = [];

  for (const file of files) {
    if (!file.name.endsWith('.json')) continue;
    fileNames.push(file.name);

    const [contents] = await file.download();
    try {
      const parsed = JSON.parse(contents.toString());
      if (Array.isArray(parsed)) {
        allLogs.push(...parsed);
      }
    } catch (err) {
      console.error(`Failed to parse ${file.name}:`, err);
    }
  }

  // Sort by timestamp descending
  allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    files: fileNames,
    logs: allLogs,
    totalCount: allLogs.length,
  };
}

/**
 * Fetch logs filtered by risk score threshold
 */
export async function fetchHighRiskLogs(threshold = 0.7): Promise<LogEntry[]> {
  const { logs } = await fetchLogsFromGCS();
  return logs.filter(log => log.risk_score >= threshold);
}
