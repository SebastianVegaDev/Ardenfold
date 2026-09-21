import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";
import { expand } from "dotenv-expand";

const environmentPaths = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];

const environmentPath = environmentPaths.find((candidatePath) => existsSync(candidatePath));

if (environmentPath !== undefined) {
    const result = config({
        path: environmentPath,
    });

    expand(result);
}
