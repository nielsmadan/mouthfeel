export type Intensity = 1 | 2 | 3;
export type ProfileCategory = "practical" | "fun";

export interface PhraseEntry {
  text: string;
  useWhen: string[];
  meaning?: string;
  avoidWhen?: string[];
  minIntensity: Intensity;
  source?: string;
  speaker?: string;
}

export interface ProfileSource {
  version: 1;
  id: string;
  displayName: string;
  category: ProfileCategory;
  summary: string;
  surpriseEligible: boolean;
  baseContract: string[];
  markers: string[];
  controlledImperfections: string[];
  avoid: string[];
  intensity: Record<Intensity, string[]>;
}

export interface CompiledProfile {
  id: string;
  displayName: string;
  category: ProfileCategory;
  summary: string;
  surpriseEligible: boolean;
  cards: Record<Intensity, string>;
  phrases?: PhraseEntry[];
}

export interface ActiveMouthfeelSessionState {
  version: 1;
  mode?: "active";
  profileId: string;
  intensity: Intensity;
  lastReplyStyled: boolean;
  updatedAt: string;
}

export interface DisabledMouthfeelSessionState {
  version: 1;
  mode: "off";
  profileId?: undefined;
  intensity?: undefined;
  lastReplyStyled: false;
  updatedAt: string;
}

export type MouthfeelSessionState = ActiveMouthfeelSessionState | DisabledMouthfeelSessionState;

export type MouthfeelCommand =
  | { type: "activate"; profileId: string; intensity: Intensity }
  | { type: "surprise"; intensity: Intensity }
  | { type: "intensity"; intensity: Intensity }
  | { type: "off" }
  | { type: "status" }
  | { type: "list" }
  | { type: "untranslate" }
  | { type: "invalid"; message: string };

export interface CommandResult {
  state: MouthfeelSessionState | null;
  instruction: string;
  notification: string;
  effect: "notify" | "profile-selected" | "profile-disabled" | "rewrite-previous";
}
