import 'dotenv/config';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';

const { S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY)
  throw new Error('Completa las credenciales S3 locales en .env.');
mkdirSync('.local/storage', { recursive: true });
writeFileSync(
  '.local/storage/s3.json',
  JSON.stringify({
    identities: [
      {
        name: 'montepica-local',
        credentials: [
          { accessKey: S3_ACCESS_KEY_ID, secretKey: S3_SECRET_ACCESS_KEY },
        ],
        actions: ['Admin', 'Read', 'List', 'Tagging', 'Write'],
      },
    ],
  }),
  { mode: 0o600 },
);
let dockerCandidates = ['/usr/local/bin/docker', '/usr/bin/docker'];
if (process.platform === 'win32') {
  dockerCandidates = ['C:/Program Files/Docker/Docker/resources/bin/docker.exe'];
} else if (process.platform === 'darwin') {
  dockerCandidates = ['/opt/homebrew/bin/docker', '/usr/local/bin/docker'];
}
const docker = dockerCandidates.find((candidate) => existsSync(candidate));
if (!docker) {
  throw new Error(
    `No se encontró Docker CLI en las ubicaciones estándar: ${dockerCandidates.join(delimiter)}.`,
  );
}
const result = spawnSync(
  docker,
  ['compose', '-f', 'compose.storage.yaml', 'up', '-d'],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
