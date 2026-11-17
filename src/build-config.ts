/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { type JsonObject, loadJsonFile } from "./utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface BuildConfig {
    appId: string;
    protocol: string;
    protocols: string[];
}

export function readBuildConfig(): BuildConfig {
    const packageJson = loadJsonFile(path.join(__dirname, "..", "package.json")) as JsonObject;
    const protocols =
        (packageJson["electron_protocols"] as string[] | undefined) ??
        ((packageJson["electron_protocol"] as string | undefined)
            ? [packageJson["electron_protocol"] as string]
            : // Default for the Echo variant (dev builds without electron-builder metadata)
              ["io.echo.desktop", "echo"]);
    return {
        appId: (packageJson["electron_appId"] as string) || "com.echo.desktop",
        protocol: protocols[0],
        protocols,
    };
}
