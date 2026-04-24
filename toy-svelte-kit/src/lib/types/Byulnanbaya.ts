export type ByulnanbayaStatus = "ready" | "playing" | "victory" | "defeat";

export type ByulnanbayaUnitKind = "bolt" | "guard" | "mage" | "ranger" | "giant";

export type ByulnanbayaUnitDefinition = {
	id: ByulnanbayaUnitKind;
	name: string;
	cost: number;
	hp: number;
	attack: number;
	speed: number;
	color: string;
};

export type ByulnanbayaFieldUnit = {
	id: number;
	team: "ally" | "enemy";
	kind: ByulnanbayaUnitKind;
	name: string;
	hp: number;
	maxHp: number;
	attack: number;
	speed: number;
	y: number;
	xOffset: number;
	color: string;
	cooldown: number;
};
