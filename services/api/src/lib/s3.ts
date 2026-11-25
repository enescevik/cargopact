import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | undefined;
const s3 = () => (client ??= new S3Client({}));
export const uploadsBucket = (): string | undefined => process.env.UPLOADS_BUCKET || undefined;

export const POD_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const POD_PUT_TTL = 300;
export const POD_GET_TTL = 600;

export const presignPut = (key: string, contentType: string) =>
  getSignedUrl(s3(), new PutObjectCommand({ Bucket: uploadsBucket(), Key: key, ContentType: contentType }), { expiresIn: POD_PUT_TTL });

export const presignGet = (key: string): Promise<string> =>
  getSignedUrl(s3(), new GetObjectCommand({ Bucket: uploadsBucket(), Key: key }), { expiresIn: POD_GET_TTL });

export async function objectExists(key: string): Promise<boolean> {
  try { await s3().send(new HeadObjectCommand({ Bucket: uploadsBucket(), Key: key })); return true; }
  catch { return false; }
}
