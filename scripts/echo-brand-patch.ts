#!/usr/bin/env -S npx tsx
/*
 * Echo branding patch: rewrites user-visible Matrix/Element branding inside an
 * extracted element-web bundle (the "deploy" directory) so the UI reads as Echo.
 *
 * Applied automatically by fetch-package.ts before webapp.asar is packed (so it
 * survives every re-fetch), or standalone:
 *   tsx scripts/echo-brand-patch.ts <deployDir>
 *
 * Only string VALUES are touched — JSON keys, code identifiers (matrixTo,
 * matrixId, _matrix API paths, matrix.to / matrix.org URLs, %(placeholders)s)
 * are preserved.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const ECHO_SERVER = "echo-server-a4ae.onrender.com";

/**
 * Exact replacements for the English source strings (en_EN), keyed by their
 * slash-joined JSON path. Exact values keep the copy readable instead of doing
 * a blind swap.
 */
const EN_STRING_MAP: Record<string, string> = {
    "auth/autodiscovery_invalid_hs":
        "Homeserver URL does not appear to be a valid Echo homeserver",
    "auth/incorrect_credentials_detail":
        `Please note you are logging into the %(hs)s server, not ${ECHO_SERVER}.`,
    "auth/reset_password_email_not_associated":
        "Your email address does not appear to be associated with an Echo ID on this account provider.",
    "auth/server_picker_description":
        "You can use the custom server options to sign into other account providers by specifying a different homeserver URL. This allows you to use %(brand)s with an existing Echo account at a different account provider.",
    "auth/server_picker_explainer":
        "Use your preferred account provider if you have one, or host your own Echo homeserver.",
    "auth/server_picker_matrix.org":
        "Your Echo homeserver is a private account provider — a registration code is required to create an account.",
    "bug_reporting/matrix_security_issue":
        "To report a security issue, please contact your Echo server administrator.",
    "common/matrix": "Echo",
    "invite/unable_find_profiles_description_default":
        "Unable to find profiles for the Echo IDs listed below - would you like to invite them anyway?",
    "labs/feature_matrixrtc_slots": "Require open RTC slots for Echo Call calls",
    "powered_by_matrix": "Powered by Echo",
    "room_settings/advanced/unfederated": "This room is not accessible by remote Echo servers",
    "service_worker_error/description":
        "%(brand)s requires a service worker for loading authenticated media from Echo content repositories. This is not supported by your browser so you may experience media failing to load.",
    "settings/key_export_import/export_description_1":
        "This process allows you to export the keys for messages you have received in encrypted rooms to a local file. You will then be able to import the file into another Echo client in the future, so that client will also be able to decrypt these messages.",
    "settings/key_export_import/import_description_1":
        "This process allows you to import encryption keys that you had previously exported from another Echo client. You will then be able to decrypt any messages that the other client could decrypt.",
    "settings/prompt_invite": "Prompt before sending invites to potentially invalid Echo IDs",
    "settings/sessions/unverified_session_explainer_3":
        "For best security and privacy, it is recommended to use Echo clients that support encryption.",
    "settings/sidebar/metaspaces_video_rooms_description_invite_extension":
        "In conferences you can invite people outside of Echo.",
    "share/share_call_subtitle": "Link for external users to join the call without an Echo account:",
    "slash_command/query_not_found_phone_number": "Unable to find Echo ID for phone number",
    "spotlight/public_rooms/network_dropdown_selected_label": "Show: Echo rooms",
    // "timeline/disambiguated_profile" is intentionally absent: "%(matrixId)s" is a
    // code placeholder, not user-visible text, and renaming it would break rendering.
    "unsupported_server_description":
        "This server is using an older version of Echo. Upgrade to Echo %(version)s to use %(brand)s without errors.",
};

/** Placeholder values that must never be swapped. */
function swapMatrixWord(value: string): string {
    const guards = [
        "matrix.org",
        "Matrix.org",
        "matrix.to",
        "Matrix.to",
        "_matrix",
        "matrixTo",
        "matrixId",
        "matrix://",
        "MatrixRTC",
        "matrixRtc",
    ];
    let out = value;
    guards.forEach((g, i) => {
        out = out.split(g).join(`%%ECHO_GUARD_${i}%%`);
    });
    out = out.replace(/[Mm]atrix/g, (m) => (m === "Matrix" ? "Echo" : "echo"));
    guards.forEach((g, i) => {
        out = out.split(`%%ECHO_GUARD_${i}%%`).join(g);
    });
    return out;
}

type Json = string | Json[] | { [k: string]: Json } | boolean | number | null;

function isPlainObject(v: Json): v is { [k: string]: Json } {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function walkStrings(node: Json, prefix: string, isEn: boolean, changed: { n: number }): void {
    if (typeof node === "string") {
        return; // handled by caller
    }
    if (Array.isArray(node)) {
        node.forEach((item, i) => {
            if (typeof item === "string") {
                const swapped = swapMatrixWord(item);
                if (swapped !== item) {
                    node[i] = swapped;
                    changed.n++;
                }
            } else {
                walkStrings(item, `${prefix}[${i}]`, isEn, changed);
            }
        });
        return;
    }
    if (isPlainObject(node)) {
        for (const key of Object.keys(node)) {
            const value = node[key];
            const childPath = prefix ? `${prefix}/${key}` : key;
            if (typeof value === "string") {
                let newValue = value;
                if (isEn && EN_STRING_MAP[childPath] !== undefined) {
                    newValue = EN_STRING_MAP[childPath];
                } else {
                    newValue = swapMatrixWord(value);
                }
                if (newValue !== value) {
                    node[key] = newValue;
                    changed.n++;
                }
            } else {
                walkStrings(value, childPath, isEn, changed);
            }
        }
    }
}

function patchI18n(deployDir: string): void {
    const i18nDir = path.join(deployDir, "i18n");
    if (!fs.existsSync(i18nDir)) return;
    for (const file of fs.readdirSync(i18nDir)) {
        if (!file.endsWith(".json")) continue;
        const filePath = path.join(i18nDir, file);
        const json = JSON.parse(fs.readFileSync(filePath, "utf8")) as Json;
        const changed = { n: 0 };
        walkStrings(json, "", file.startsWith("en_EN"), changed);
        if (changed.n > 0) {
            fs.writeFileSync(filePath, JSON.stringify(json, null, 4));
            console.log(`echo-brand: ${file} — ${changed.n} strings updated`);
        }
    }
}

function patchHtml(deployDir: string): void {
    const htmlPath = path.join(deployDir, "index.html");
    if (!fs.existsSync(htmlPath)) return;
    let html = fs.readFileSync(htmlPath, "utf8");
    const replacements: Array<[string, string]> = [
        ["<title>Element</title>", "<title>Echo</title>"],
        ['content="Element"', 'content="Echo"'],
        ["Sorry, Element requires JavaScript", "Sorry, Echo requires JavaScript"],
        [
            "https://app.element.io/themes/element/img/logos/opengraph.png",
            "themes/element/img/logos/opengraph.png",
        ],
    ];
    let n = 0;
    for (const [from, to] of replacements) {
        while (html.includes(from)) {
            html = html.replace(from, to);
            n++;
        }
    }
    if (n > 0) {
        fs.writeFileSync(htmlPath, html);
        console.log(`echo-brand: index.html — ${n} replacements`);
    }
}

function patchManifest(deployDir: string): void {
    const manifestPath = path.join(deployDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) return;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    let changed = false;
    if (manifest["name"] !== "Echo") {
        manifest["name"] = "Echo";
        manifest["short_name"] = "Echo";
        manifest["theme_color"] = "#071A6E"; // Echo Navy
        changed = true;
    }
    if (changed) {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4));
        console.log("echo-brand: manifest.json updated");
    }
}

/**
 * Overwrites the bundle's icon/logo assets with the pre-rendered Echo images
 * from the cache directory produced by scripts/make-echo-icons.ps1
 * (%TEMP%/echo-icons/echo-<size>.png).
 */
function patchIcons(deployDir: string): void {
    const cacheDir = path.join(process.env.TEMP ?? process.env.TMP ?? "", "echo-icons");
    if (!fs.existsSync(cacheDir)) {
        console.warn("echo-brand: icon cache not found, run scripts/make-echo-icons.ps1 first");
        return;
    }
    const read = (size: number): Buffer | undefined => {
        const p = path.join(cacheDir, `echo-${size}.png`);
        return fs.existsSync(p) ? fs.readFileSync(p) : undefined;
    };

    // vector-icons: favicon set + manifest icons (plain and content-hashed names)
    const iconsDir = path.join(deployDir, "vector-icons");
    if (fs.existsSync(iconsDir)) {
        let n = 0;
        for (const file of fs.readdirSync(iconsDir)) {
            const m = /^(\d+)(\.[0-9a-f]+)?\.png$/.exec(file);
            if (!m) continue;
            const buf = read(Number(m[1]));
            if (buf) {
                fs.writeFileSync(path.join(iconsDir, file), buf);
                n++;
            }
        }
        console.log(`echo-brand: vector-icons — ${n} icons replaced`);
    }

    // Element logos inside the theme (fallback auth logo, badge-drawing logo, og image)
    const logosDir = path.join(deployDir, "themes", "element", "img", "logos");
    if (fs.existsSync(logosDir)) {
        const appLogo = read(320);
        const appLogoPath = path.join(logosDir, "element-app-logo.png");
        if (appLogo && fs.existsSync(appLogoPath)) {
            fs.writeFileSync(appLogoPath, appLogo);
        }
        const png320 = read(320);
        const svgPath = path.join(logosDir, "element-logo.svg");
        if (png320 && fs.existsSync(svgPath)) {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><image width="320" height="320" href="data:image/png;base64,${png320.toString("base64")}"/></svg>`;
            fs.writeFileSync(svgPath, svg);
        }
        const ogPath = path.join(logosDir, "opengraph.png");
        const og = path.join(cacheDir, "echo-opengraph.png");
        if (fs.existsSync(ogPath) && fs.existsSync(og)) {
            fs.writeFileSync(ogPath, fs.readFileSync(og));
        }
        console.log("echo-brand: theme logos replaced");
    }
}

export async function patchEchoBranding(deployDir: string): Promise<void> {
    patchI18n(deployDir);
    patchHtml(deployDir);
    patchManifest(deployDir);
    patchIcons(deployDir);
    console.log("echo-brand: done");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const deployDir = process.argv[2];
    if (!deployDir) {
        console.error("Usage: tsx scripts/echo-brand-patch.ts <deployDir>");
        process.exit(1);
    }
    await patchEchoBranding(deployDir);
}
