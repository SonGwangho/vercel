import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "src", "lib", "assets", "data");
const routeDir = path.join(root, "src", "routes");
const errors = [];

function readJson(filePath) {
	const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");

	try {
		return JSON.parse(raw);
	} catch (error) {
		errors.push(`${path.relative(root, filePath)}: invalid JSON (${error.message})`);
		return null;
	}
}

function isTreeMenu(value) {
	return (
		value &&
		typeof value === "object" &&
		typeof value.id === "string" &&
		value.id.trim() &&
		typeof value.name === "string" &&
		value.name.trim() &&
		typeof value.path === "string" &&
		value.path.startsWith("/") &&
		Number.isInteger(value.order) &&
		(value.parent === undefined || typeof value.parent === "string") &&
		(value.description === undefined || typeof value.description === "string")
	);
}

function routeFileForUrl(urlPath) {
	const segments = urlPath.split("/").filter(Boolean);
	return path.join(routeDir, ...segments, "+page.svelte");
}

function validateTreeMenuFile(filePath) {
	const value = readJson(filePath);
	const label = path.relative(root, filePath);

	if (!Array.isArray(value)) {
		errors.push(`${label}: expected an array`);
		return;
	}

	const ids = new Set();
	const paths = new Set();

	for (const [index, item] of value.entries()) {
		if (!isTreeMenu(item)) {
			errors.push(`${label}[${index}]: invalid TreeMenu shape`);
			continue;
		}

		if (ids.has(item.id)) {
			errors.push(`${label}: duplicate id "${item.id}"`);
		}

		if (paths.has(item.path)) {
			errors.push(`${label}: duplicate path "${item.path}"`);
		}

		ids.add(item.id);
		paths.add(item.path);

		if (!existsSync(routeFileForUrl(item.path))) {
			errors.push(`${label}: route "${item.path}" does not have a +page.svelte`);
		}
	}
}

function validateGameCodes() {
	const filePath = path.join(dataDir, "game", "codes.json");
	const value = readJson(filePath);
	const label = path.relative(root, filePath);

	if (!Array.isArray(value)) {
		errors.push(`${label}: expected an array`);
		return;
	}

	const ids = new Set();
	const codes = new Set();

	for (const [index, item] of value.entries()) {
		if (!isTreeMenu(item)) {
			errors.push(`${label}[${index}]: invalid base game menu shape`);
			continue;
		}

		if (!Number.isInteger(item.gameCode)) {
			errors.push(`${label}[${index}]: gameCode must be an integer`);
		}

		if (typeof item.gameName !== "string" || !item.gameName.trim()) {
			errors.push(`${label}[${index}]: gameName is required`);
		}

		if (typeof item.hasRanking !== "boolean") {
			errors.push(`${label}[${index}]: hasRanking must be boolean`);
		}

		if (ids.has(item.id)) {
			errors.push(`${label}: duplicate id "${item.id}"`);
		}

		if (codes.has(item.gameCode)) {
			errors.push(`${label}: duplicate gameCode "${item.gameCode}"`);
		}

		ids.add(item.id);
		codes.add(item.gameCode);
	}
}

const topMenuFile = path.join(dataDir, "menu.json");
validateTreeMenuFile(topMenuFile);

const topMenus = readJson(topMenuFile);
const menuFileNames = new Set(["admin.json"]);

if (Array.isArray(topMenus)) {
	for (const menu of topMenus) {
		if (isTreeMenu(menu)) {
			menuFileNames.add(`${menu.id}.json`);
		}
	}
}

for (const fileName of menuFileNames) {
	const filePath = path.join(dataDir, fileName);

	if (existsSync(filePath)) {
		validateTreeMenuFile(filePath);
	}
}

validateGameCodes();

if (errors.length > 0) {
	console.error("Data validation failed:");
	for (const error of errors) {
		console.error(`- ${error}`);
	}
	process.exit(1);
}

console.log("Data validation passed.");
