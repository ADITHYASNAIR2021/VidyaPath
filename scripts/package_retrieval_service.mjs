import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync('lib/context/retrieval_manifest.json', 'utf8'));
const id = sha(`${manifest.artifactFingerprint}:${manifest.optionalVectorArtifact?.uncompressedSha256}`).slice(0, 24);
const release = path.resolve('.cache/semantic-releases', id);
if (!existsSync(release)) throw new Error('Run node scripts/export_semantic_release.mjs --apply first');
const data = JSON.parse(readFileSync(path.join(release, 'semantic_manifest.json'), 'utf8'));
if (data.corpusFingerprint !== manifest.artifactFingerprint || data.vectorSha256 !== manifest.optionalVectorArtifact?.uncompressedSha256) throw new Error('Semantic release does not match the app');
const codeFiles = ['package.json', 'package-lock.json', 'Dockerfile', 'compose.yaml', '.dockerignore', '.env.example', 'Caddyfile.example', 'encoder.mjs', 'server.mjs'];
const version = sha(codeFiles.map((file) => `${file}:${sha(readFileSync(path.join('services/retrieval', file)))}`).join('\n')).slice(0, 12);
const output = path.resolve('.cache', `retrieval-deploy-${id}-${version}`);
mkdirSync(path.join(output, 'release'), { recursive: true });
for (const file of codeFiles) copyFileSync(path.join('services/retrieval', file), path.join(output, file));
for (const file of data.files) {
  if (!['rows.json', 'vectors.f32'].includes(file.name) || sha(readFileSync(path.join(release, file.name))) !== file.sha256) throw new Error('Invalid semantic release');
  copyFileSync(path.join(release, file.name), path.join(output, 'release', file.name));
}
copyFileSync(path.join(release, 'semantic_manifest.json'), path.join(output, 'release/semantic_manifest.json'));
writeFileSync(path.join(output, 'DEPLOY_INFO.json'), JSON.stringify({ releaseId: id, codeVersion: version, corpusFingerprint: manifest.artifactFingerprint, count: data.count, note: 'Contains no credentials or student data. Create .env only on the server. Follow docs/DEPLOYMENT_RUNBOOK.md.' }, null, 2) + '\n');
console.log(`Upload-ready service directory: ${output}`);
console.log('Copy this directory to your retrieval VM. Do not upload the entire workspace, dataset, .env.local or .cache directory.');
