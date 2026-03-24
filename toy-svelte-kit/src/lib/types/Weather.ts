export type AirQualityMetric = {
	key: "pm25" | "pm10" | "o3";
	label: string;
	value: string;
	unit: string;
	status: string;
	level: number;
};

export type CurrentWeather = {
	locationName: string;
	sourceUrl: string;
	updatedAt: string;
	temperature: string;
	feelsLike: string | null;
	summary: string | null;
	alert: string | null;
	humidity: string | null;
	wind: string | null;
	precipitation: string | null;
	sunrise: string | null;
	sunset: string | null;
	commentaryUrl: string | null;
	rainVideoUrl: string | null;
	airQuality: AirQualityMetric[];
	airQualitySource: string | null;
};

export type CurrentWeatherResponse = {
	weather: CurrentWeather;
};