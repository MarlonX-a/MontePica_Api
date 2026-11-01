import 'dotenv/config';
import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
const endpoint = new URL(S3_ENDPOINT ?? '');
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(endpoint.hostname) || endpoint.protocol !== 'http:' || endpoint.port !== '9000') {
  throw new Error('La inicialización local requiere S3_ENDPOINT=http://localhost:9000.');
}
if (!S3_REGION || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error('Completa la configuración S3 local en .env.');
const client = new S3Client({ region: S3_REGION, endpoint: endpoint.href, forcePathStyle: true,
  credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY } });
try {
  try {
    await client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
    console.log(`El bucket ${S3_BUCKET} ya existe.`);
  } catch (error) {
    if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound' && error?.name !== 'NoSuchBucket') throw error;
    await client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
    console.log(`Bucket privado ${S3_BUCKET} creado.`);
  }
} finally { client.destroy(); }
