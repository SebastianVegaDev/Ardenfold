import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

async function main(): Promise<void> {
    const endpoint = process.env.FILE_STORAGE_ENDPOINT;
    const bucket = process.env.FILE_STORAGE_BUCKET;
    const region = process.env.FILE_STORAGE_REGION;
    const accessKeyId = process.env.FILE_STORAGE_ACCESS_KEY_ID;
    const secretAccessKey = process.env.FILE_STORAGE_SECRET_ACCESS_KEY;
    if (
        !endpoint ||
        !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/u.test(endpoint) ||
        !bucket ||
        !region ||
        !accessKeyId ||
        !secretAccessKey
    ) {
        throw new Error("Local file storage configuration is incomplete or non-local.");
    }
    const client = new S3Client({
        endpoint,
        region,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
    });
    try {
        try {
            await client.send(new HeadBucketCommand({ Bucket: bucket }));
        } catch (error) {
            if (!(error instanceof Error) || error.name !== "NotFound") throw error;
            await client.send(new CreateBucketCommand({ Bucket: bucket }));
        }
    } finally {
        client.destroy();
    }
}

void main().catch((error: unknown) => {
    process.stderr.write(
        error instanceof Error ? `${error.message}\n` : "Local bucket creation failed.\n",
    );
    process.exitCode = 1;
});
