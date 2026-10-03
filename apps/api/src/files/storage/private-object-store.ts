import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { EnvironmentVariables } from "../../config/environment";

export const maxPrivateFileBytes = 10_485_760;

export type PrivateObject = Readonly<{ bytes: Buffer; mediaType: string }>;

@Injectable()
export class PrivateObjectStore {
    private client: S3Client | undefined;

    constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

    private settings(): { client: S3Client; bucket: string } {
        const bucket = this.config.get("FILE_STORAGE_BUCKET", { infer: true });
        const region = this.config.get("FILE_STORAGE_REGION", { infer: true });
        const endpoint = this.config.get("FILE_STORAGE_ENDPOINT", { infer: true });
        const accessKeyId = this.config.get("FILE_STORAGE_ACCESS_KEY_ID", { infer: true });
        const secretAccessKey = this.config.get("FILE_STORAGE_SECRET_ACCESS_KEY", { infer: true });
        if (!bucket || !region || !accessKeyId || !secretAccessKey) {
            throw new Error("Private file storage is not configured.");
        }
        this.client ??= new S3Client({
            region,
            ...(endpoint ? { endpoint } : {}),
            forcePathStyle: Boolean(endpoint),
            credentials: { accessKeyId, secretAccessKey },
        });
        return { client: this.client, bucket };
    }

    async put(key: string, object: PrivateObject, sha256Hex: string): Promise<void> {
        if (object.bytes.length < 1 || object.bytes.length > maxPrivateFileBytes) {
            throw new Error("Private object size is outside allowed bounds.");
        }
        const { client, bucket } = this.settings();
        await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: object.bytes,
                ContentType: object.mediaType,
                ContentLength: object.bytes.length,
                Metadata: { sha256: sha256Hex },
            }),
        );
    }

    async get(key: string): Promise<PrivateObject | null> {
        const { client, bucket } = this.settings();
        try {
            const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
            if (!head.ContentLength || head.ContentLength > maxPrivateFileBytes) {
                throw new Error("Private object size is outside allowed bounds.");
            }
            const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
            if (!object.Body) throw new Error("Private object body is missing.");
            const chunks: Buffer[] = [];
            let length = 0;
            for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
                length += chunk.length;
                if (length > maxPrivateFileBytes)
                    throw new Error("Private object exceeds the download limit.");
                chunks.push(Buffer.from(chunk));
            }
            const bytes = Buffer.concat(chunks, length);
            if (bytes.length !== head.ContentLength) {
                throw new Error("Private object length changed during read.");
            }
            return { bytes, mediaType: head.ContentType ?? "application/octet-stream" };
        } catch (error) {
            if (
                error instanceof Error &&
                (error.name === "NotFound" || error.name === "NoSuchKey")
            ) {
                return null;
            }
            throw error;
        }
    }

    async delete(key: string): Promise<void> {
        const { client, bucket } = this.settings();
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
}
