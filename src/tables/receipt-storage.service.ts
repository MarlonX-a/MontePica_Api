import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class ReceiptStorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string;
  readonly prefix: string;

  constructor(config: ConfigService) {
    this.bucket=config.get<string>('S3_BUCKET','');
    this.prefix=config.get<string>('S3_PREFIX','montepica/receipts/');
    this.client=config.get<boolean>('TRANSFER_PAYMENTS_ENABLED',false) ? new S3Client({
      region:config.getOrThrow<string>('S3_REGION'),
      endpoint:config.get<string>('S3_ENDPOINT') || undefined,
      forcePathStyle:config.get<boolean>('S3_FORCE_PATH_STYLE',false),
      credentials:{accessKeyId:config.getOrThrow<string>('S3_ACCESS_KEY_ID'),secretAccessKey:config.getOrThrow<string>('S3_SECRET_ACCESS_KEY')},
      requestHandler: { requestTimeout: 15000, connectionTimeout: 5000 },
    }) : null;
  }

  private active():S3Client {
    if (!this.client) throw new ServiceUnavailableException('El almacenamiento de comprobantes no está habilitado.');
    return this.client;
  }

  async put(key:string,body:Buffer,mime:string) {
    try {await this.active().send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:body,ContentType:mime}));}
    catch {throw new ServiceUnavailableException('No se pudo guardar el comprobante.');}
  }
  async get(key:string) {
    try {
      const response=await this.active().send(new GetObjectCommand({Bucket:this.bucket,Key:key}));
      if (!response.Body) throw new Error('Objeto vacío.');
      return Buffer.from(await response.Body.transformToByteArray());
    } catch {throw new ServiceUnavailableException('No se pudo leer el comprobante.');}
  }
  async delete(key:string) { try {await this.active().send(new DeleteObjectCommand({Bucket:this.bucket,Key:key}));} catch {throw new ServiceUnavailableException('No se pudo eliminar el comprobante.');} }
  async listOld(cutoff:Date) {
    const objects:Array<{key:string;modified:Date}>=[]; let token:string|undefined;
    do {
      const page=await this.active().send(new ListObjectsV2Command({Bucket:this.bucket,Prefix:this.prefix,ContinuationToken:token}));
      for (const item of page.Contents ?? []) if (item.Key?.startsWith(this.prefix) && item.LastModified && item.LastModified<cutoff) objects.push({key:item.Key,modified:item.LastModified});
      token=page.IsTruncated?page.NextContinuationToken:undefined;
      if (page.IsTruncated && !token) throw new Error('S3 no devolvió el cursor de paginación.');
    } while (token);
    return objects;
  }
}
