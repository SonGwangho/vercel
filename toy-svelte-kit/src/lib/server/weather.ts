import type { AirQualityMetric, CurrentWeather } from "$lib";

const WEATHER_PAGE_URL =
	"https://www.weather.go.kr/w/index.do#dong/2726068000/35.83423587946756/128.68188186136277/%EB%8C%80%EA%B5%AC%EA%B4%91%EC%97%AD%EC%8B%9C%20%EC%88%98%EC%84%B1%EA%B5%AC%20%EA%B3%A0%EC%82%B02%EB%8F%99/LOC/%EC%9C%84%EA%B2%BD%EB%8F%84(35.83,128.68)";
const WEATHER_FRAGMENT_URL =
	"https://www.weather.go.kr/w/wnuri-fct2021/main/current-weather.do?code=2726068000&unit=m%2Fs&aws=N&lat=35.83423587946756&lon=128.68188186136277";
const WEATHER_ORIGIN = "https://www.weather.go.kr";
const LOCATION_NAME = "대구광역시 수성구 고산2동";

function decodeHtml(value: string): string {
	return value
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function stripTags(value: string): string {
	return decodeHtml(value.replace(/<[^>]+>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

function matchOne(source: string, pattern: RegExp): string | null {
	const match = source.match(pattern);
	return match?.[1] ? stripTags(match[1]) : null;
}

function toAbsoluteUrl(url: string | null): string | null {
	if (!url) {
		return null;
	}

	if (/^https?:\/\//i.test(url)) {
		return url;
	}

	return `${WEATHER_ORIGIN}${url}`;
}

function extractMetricValue(html: string, labelClass: string): string | null {
	const escaped = labelClass.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(
		`<span class="lbl[^"]*${escaped}[^"]*">[\\s\\S]*?<\\/span>\\s*<span class="val">([\\s\\S]*?)<\\/span>`,
		"i"
	);

	return matchOne(html, pattern);
}

function extractLifestyleValue(html: string, className: string): string | null {
	const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(
		`<span class="sym-ic ${escaped} with-txt">[\\s\\S]*?<\\/span>\\s*<span>([\\s\\S]*?)<\\/span>`,
		"i"
	);

	return matchOne(html, pattern);
}

function extractTemperature(html: string): string | null {
	const value = matchOne(html, /<span class="tmp">\s*([^<\s]+)/i);
	return value ? `${value}℃` : null;
}

function extractFeelsLike(html: string): string | null {
	return matchOne(html, /<span class="chill">\s*체감\(([^)]+)\)\s*<\/span>/i);
}

function extractActionLink(html: string, label: string): string | null {
	const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`<a href="([^"]+)"[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/a>`, "i");
	return toAbsoluteUrl(html.match(pattern)?.[1] ?? null);
}

function extractAirQuality(html: string): AirQualityMetric[] {
	const metrics: AirQualityMetric[] = [];
	const listPattern = /<li>\s*<span class="lbl">([\s\S]*?)<\/span>\s*<strong class="air-level val">([\s\S]*?)<\/strong>\s*<\/li>/gi;
	let match: RegExpExecArray | null;

	while ((match = listPattern.exec(html)) !== null) {
		const labelBlock = match[1] ?? "";
		const valueBlock = match[2] ?? "";
		const label = stripTags(labelBlock);
		const value = matchOne(valueBlock, /<span class="air-lvv">([\s\S]*?)<\/span>/i) ?? "";
		const unit = matchOne(valueBlock, /<small class="unit">([\s\S]*?)<\/small>/i) ?? "";
		const status = matchOne(valueBlock, /<span class="air-lvt"[^>]*>([\s\S]*?)<a /i) ?? matchOne(valueBlock, /<span class="air-lvt"[^>]*>([\s\S]*?)<\/span>/i) ?? "";
		const levelText = valueBlock.match(/air-lvv-(\d)/i)?.[1] ?? "1";
		const level = Number(levelText);

		let key: AirQualityMetric["key"] | null = null;
		if (label.includes("초미세먼지")) key = "pm25";
		if (label.includes("미세먼지") && !label.includes("초")) key = "pm10";
		if (label.includes("오존")) key = "o3";

		if (key && value && unit && status) {
			metrics.push({ key, label, value, unit, status, level });
		}
	}

	return metrics;
}

function normalizeCurrentWeather(html: string): CurrentWeather | null {
	const updatedAt = matchOne(
		html,
		/<a[^>]*class="updated-at"[^>]*>[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<\/a>/i
	);
	const temperature = extractTemperature(html);

	if (!updatedAt || !temperature) {
		return null;
	}

	return {
		locationName: LOCATION_NAME,
		sourceUrl: WEATHER_PAGE_URL,
		updatedAt,
		temperature,
		feelsLike: extractFeelsLike(html),
		summary: matchOne(html, /<li class="w-txt">([\s\S]*?)<\/li>/i),
		alert: matchOne(html, /<span class="wrn">([\s\S]*?)<\/span>/i),
		humidity: extractMetricValue(html, "ic-hm"),
		wind: extractMetricValue(html, "ic-wind"),
		precipitation: extractMetricValue(html, "ic-rn"),
		sunrise: extractLifestyleValue(html, "sunrise"),
		sunset: extractLifestyleValue(html, "sunset"),
		commentaryUrl: extractActionLink(html, "날씨해설"),
		rainVideoUrl: extractActionLink(html, "강수"),
		airQuality: extractAirQuality(html),
		airQualitySource: matchOne(html, /<p class="right">([\s\S]*?)<\/p>/i)
	};
}

export async function fetchCurrentWeather(fetcher: typeof fetch): Promise<CurrentWeather | null> {
	const response = await fetcher(WEATHER_FRAGMENT_URL, {
		headers: {
			accept: "text/html,application/xhtml+xml",
			"accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
		}
	});

	if (!response.ok) {
		throw new Error("Failed to load current weather.");
	}

	const html = await response.text();
	return normalizeCurrentWeather(html);
}