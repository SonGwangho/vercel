export type LoungeHairStyle = "short" | "bob" | "long" | "ponytail" | "bun" | "twintails" | "spiky" | "buzz";
export type LoungeTopStyle = "longSleeve" | "shortSleeve" | "sleeveless" | "hoodie" | "shirt";
export type LoungeBottomStyle = "longPants" | "shortPants" | "longSkirt" | "shortSkirt";
export type LoungeAppearanceSection = "hair" | "top" | "bottom";
export type LoungeAppearance = {
  hairStyle: LoungeHairStyle;
  hairColor: string;
  topStyle: LoungeTopStyle;
  topColor: string;
  bottomStyle: LoungeBottomStyle;
  pantsColor: string;
  skirtColor: string;
};
export type LoungeStyleOption<T extends string> = { id: T; name: string };
export type LoungeColorOption = { value: string; name: string };
export type LoungeAppearanceCatalog = {
  sections: LoungeStyleOption<LoungeAppearanceSection>[];
  hairStyles: LoungeStyleOption<LoungeHairStyle>[];
  topStyles: LoungeStyleOption<LoungeTopStyle>[];
  bottomStyles: LoungeStyleOption<LoungeBottomStyle>[];
  hairColors: LoungeColorOption[];
  topColors: LoungeColorOption[];
  bottomColors: LoungeColorOption[];
};
export type LoungeAvatarEditorProps = { value: LoungeAppearance; disabled?: boolean; onChange: (value: LoungeAppearance) => void };
export type LoungeAvatarPreviewProps = { appearance: LoungeAppearance; nickname: string };
export type LoungeColorPickerProps = { label: string; name: string; value: string; options: LoungeColorOption[]; onSelect: (value: string) => void };
