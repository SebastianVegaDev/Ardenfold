import { CreateBucketCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ConfigService } from "@nestjs/config";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { EnvironmentVariables } from "../../config/environment";
import { sha256 } from "../uploads/file-content";
import { PrivateObjectStore } from "./private-object-store";

const image =
    "ghcr.io/versity/versitygw@sha256:30292fc2eeacc67a36993b01f7a7a5e3361a19cced0e80c1d71cfa2a4b0a2499";
const bucket = "ardenfold-private-test";
const accessKeyId = "file-test-key";
const secretAccessKey = "file-test-secret";

describe("private S3-compatible object storage", () => {
    let container: StartedTestContainer;
    let client: S3Client;
    let store: PrivateObjectStore;
    let endpoint: string;

    beforeAll(async () => {
        container = await new GenericContainer(image)
            .withEnvironment({
                ROOT_ACCESS_KEY: accessKeyId,
                ROOT_SECRET_KEY: secretAccessKey,
                VGW_BACKEND: "posix",
                VGW_BACKEND_ARGS: "/tmp",
                VGW_PORT: ":7070",
            })
            .withExposedPorts(7070)
            .start();
        endpoint = `http://${container.getHost()}:${container.getMappedPort(7070)}`;
        client = new S3Client({
            region: "us-east-1",
            endpoint,
            forcePathStyle: true,
            credentials: { accessKeyId, secretAccessKey },
        });
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        const settings = {
            FILE_STORAGE_ENDPOINT: endpoint,
            FILE_STORAGE_REGION: "us-east-1",
            FILE_STORAGE_BUCKET: bucket,
            FILE_STORAGE_ACCESS_KEY_ID: accessKeyId,
            FILE_STORAGE_SECRET_ACCESS_KEY: secretAccessKey,
        };
        store = new PrivateObjectStore({
            get: (key: keyof typeof settings) => settings[key],
        } as ConfigService<EnvironmentVariables, true>);
    }, 60_000);

    afterAll(async () => {
        client?.destroy();
        await container?.stop();
    });

    it("stores and retrieves exact bytes privately with digest metadata", async () => {
        const key = "opaque/0f2adbbc-a247-472e-9c5a-cd232982a10d";
        const bytes = Buffer.from("technical note\n");
        const digest = sha256(bytes);
        await store.put(key, { bytes, mediaType: "text/plain" }, digest);
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        expect(head.ContentLength).toBe(bytes.length);
        expect(head.Metadata?.sha256).toBe(digest);
        expect(await store.get(key)).toEqual({ bytes, mediaType: "text/plain" });
        const anonymous = await fetch(`${endpoint}/${bucket}/${key}`);
        expect(anonymous.status).toBe(403);
        await store.delete(key);
        expect(await store.get(key)).toBeNull();
    });

    it("rejects empty and oversized writes", async () => {
        await expect(
            store.put("empty", { bytes: Buffer.alloc(0), mediaType: "text/plain" }, "0".repeat(64)),
        ).rejects.toThrow();
        await expect(
            store.put(
                "too-large",
                { bytes: Buffer.alloc(10_485_761), mediaType: "text/plain" },
                "0".repeat(64),
            ),
        ).rejects.toThrow();
    });
});
